export { 
	SecurePathValidator, 
	TypeSafePathValidator,
	SecurityError,
	type ValidatedPath 
} from './path-validator';

export { 
	VaultSecurityManager,
	OperationType,
	DEFAULT_SECURITY_SETTINGS,
	type SecuritySettings,
	type VaultOperation,
	type ValidatedOperation
} from './vault-security-manager';