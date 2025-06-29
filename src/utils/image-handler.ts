import path from 'path';

export interface ImageFile {
  path: string;
  mimeType: string;
  base64Data: string;
}

export interface ImageProcessingConfig {
  mode: 'none' | 'casual' | 'aggressive';
  maxDimension?: number;
  quality?: number;
}

export const IMAGE_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', 
  '.webp', '.ico', '.tiff', '.tif', '.avif'
];

export const IMAGE_PROCESSING_PRESETS: Record<string, ImageProcessingConfig> = {
  none: { mode: 'none' },
  casual: { mode: 'casual', maxDimension: 2048, quality: 0.8 },
  aggressive: { mode: 'aggressive', maxDimension: 1024, quality: 0.6 }
};

export function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.avif': 'image/avif'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Process image using Obsidian's DOM APIs (Canvas-based resizing)
 */
export async function processImageResponse(
  filePath: string, 
  arrayBuffer: ArrayBuffer, 
  config: ImageProcessingConfig = IMAGE_PROCESSING_PRESETS.casual
): Promise<ImageFile> {
  const buffer = Buffer.from(arrayBuffer);
  
  // Skip processing if mode is 'none'
  if (config.mode === 'none') {
    return {
      path: filePath,
      mimeType: getMimeType(filePath),
      base64Data: buffer.toString('base64')
    };
  }
  
  try {
    // Use Obsidian's DOM APIs for image processing
    console.log(`Processing image ${filePath} with config:`, config);
    const resizedBuffer = await resizeImageWithCanvas(buffer, config);
    console.log(`Successfully resized image from ${buffer.length} to ${resizedBuffer.length} bytes`);
    
    return {
      path: filePath,
      mimeType: getMimeType(filePath),
      base64Data: resizedBuffer.toString('base64')
    };
  } catch (error) {
    // If processing fails, return original
    console.warn('Failed to process image with Canvas:', error);
    console.log(`Returning original image (${buffer.length} bytes)`);
    return {
      path: filePath,
      mimeType: getMimeType(filePath),
      base64Data: buffer.toString('base64')
    };
  }
}

/**
 * Resize image using Canvas API (available in Obsidian's Electron environment)
 */
async function resizeImageWithCanvas(
  buffer: Buffer, 
  config: ImageProcessingConfig
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      // Create image element
      const img = new Image();
      
      img.onload = () => {
        try {
          const { width: originalWidth, height: originalHeight } = img;
          const maxDimension = config.maxDimension || 2048;
          
          // Check if resizing is needed
          if (originalWidth <= maxDimension && originalHeight <= maxDimension) {
            // No resizing needed, but convert to JPEG with quality
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            if (!ctx) {
              throw new Error('Failed to get canvas context');
            }
            
            canvas.width = originalWidth;
            canvas.height = originalHeight;
            ctx.drawImage(img, 0, 0);
            
            canvas.toBlob((blob) => {
              if (!blob) {
                reject(new Error('Failed to create blob from canvas'));
                return;
              }
              
              const reader = new FileReader();
              reader.onload = () => {
                if (reader.result instanceof ArrayBuffer) {
                  resolve(Buffer.from(reader.result));
                } else {
                  reject(new Error('Unexpected FileReader result type'));
                }
              };
              reader.onerror = () => reject(new Error('Failed to read blob'));
              reader.readAsArrayBuffer(blob);
            }, 'image/jpeg', config.quality || 0.8);
            
            return;
          }
          
          // Calculate new dimensions while maintaining aspect ratio
          let newWidth = originalWidth;
          let newHeight = originalHeight;
          
          if (originalWidth > originalHeight) {
            // Landscape orientation
            if (originalWidth > maxDimension) {
              newHeight = Math.round((originalHeight * maxDimension) / originalWidth);
              newWidth = maxDimension;
            }
          } else {
            // Portrait or square orientation
            if (originalHeight > maxDimension) {
              newWidth = Math.round((originalWidth * maxDimension) / originalHeight);
              newHeight = maxDimension;
            }
          }
          
          // Create canvas for resizing
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            throw new Error('Failed to get canvas context');
          }
          
          canvas.width = newWidth;
          canvas.height = newHeight;
          
          // Draw resized image
          ctx.drawImage(img, 0, 0, newWidth, newHeight);
          
          // Convert to buffer
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob from canvas'));
              return;
            }
            
            const reader = new FileReader();
            reader.onload = () => {
              if (reader.result instanceof ArrayBuffer) {
                resolve(Buffer.from(reader.result));
              } else {
                reject(new Error('Unexpected FileReader result type'));
              }
            };
            reader.onerror = () => reject(new Error('Failed to read blob'));
            reader.readAsArrayBuffer(blob);
          }, 'image/jpeg', config.quality || 0.8);
          
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      
      // Create blob URL from buffer
      const blob = new Blob([buffer]);
      img.src = URL.createObjectURL(blob);
      
    } catch (error) {
      reject(error);
    }
  });
}