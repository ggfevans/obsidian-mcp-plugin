import path from 'path';
import Pica from 'pica';

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

const pica = new Pica();

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
 * Process image using Pica (pure JavaScript, high-quality resizing)
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
    // Use Pica for image processing
    const resizedBuffer = await resizeImageWithPica(buffer, config);
    
    return {
      path: filePath,
      mimeType: getMimeType(filePath),
      base64Data: resizedBuffer.toString('base64')
    };
  } catch (error) {
    // If processing fails, return original
    console.warn('Failed to process image with Pica:', error);
    return {
      path: filePath,
      mimeType: getMimeType(filePath),
      base64Data: buffer.toString('base64')
    };
  }
}

/**
 * Resize image using Pica (high-quality pure JavaScript resizing)
 */
async function resizeImageWithPica(
  buffer: Buffer, 
  config: ImageProcessingConfig
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Create image element
    const img = new Image();
    
    img.onload = async () => {
      try {
        const { width: originalWidth, height: originalHeight } = img;
        const maxDimension = config.maxDimension || 2048;
        
        // Check if resizing is needed
        if (originalWidth <= maxDimension && originalHeight <= maxDimension) {
          // No resizing needed
          resolve(buffer);
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
        
        // Create source canvas
        const sourceCanvas = document.createElement('canvas');
        const sourceCtx = sourceCanvas.getContext('2d');
        
        if (!sourceCtx) {
          throw new Error('Failed to get source canvas context');
        }
        
        sourceCanvas.width = originalWidth;
        sourceCanvas.height = originalHeight;
        sourceCtx.drawImage(img, 0, 0);
        
        // Create destination canvas
        const destCanvas = document.createElement('canvas');
        destCanvas.width = newWidth;
        destCanvas.height = newHeight;
        
        // Use Pica to resize with high quality
        await pica.resize(sourceCanvas, destCanvas, {
          quality: 3 // Highest quality (0=fastest, 3=slowest/best)
        });
        
        // Convert to buffer
        destCanvas.toBlob((blob) => {
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
  });
}