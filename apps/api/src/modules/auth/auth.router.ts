import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { generateJwt } from '../../utils/jwt.js';
import { userStore, normalizeIndianMobile } from './userStore.js';
import { userPreferenceService } from '../../services/notifications/userPreference.service.js';

export const authRouter = Router();

const RegisterSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  phoneNumber: z.string().refine((val) => {
    try {
      normalizeIndianMobile(val);
      return true;
    } catch {
      return false;
    }
  }, { message: 'Must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9' }),
  password: z.string().min(8),
  smsConsent: z.boolean().default(true),
  minSeverityThreshold: z.enum(['WATCH', 'WARNING', 'CRITICAL']).default('WARNING'),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const UpdateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  phoneNumber: z.string().refine((val) => {
    try {
      normalizeIndianMobile(val);
      return true;
    } catch {
      return false;
    }
  }, { message: 'Must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9' }).optional(),
  smsConsent: z.boolean().optional(),
  minSeverityThreshold: z.enum(['WATCH', 'WARNING', 'CRITICAL']).optional(),
});

/**
 * Register User
 * POST /api/v1/auth/register
 */
authRouter.post('/register', (req: Request, res: Response) => {
  try {
    const data = RegisterSchema.parse(req.body);

    const user = userStore.createUser({
      email: data.email,
      fullName: data.fullName,
      phoneNumber: data.phoneNumber,
      smsEnabled: data.smsConsent,
      minSeverityThreshold: data.minSeverityThreshold,
    });

    // Sync notification preferences
    userPreferenceService.updatePreferences(user.id, {
      phoneNumber: user.phoneNumber,
      smsOptIn: user.smsEnabled,
      minSeverity: user.minSeverityThreshold,
    });

    const accessToken = generateJwt({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        smsEnabled: user.smsEnabled,
        minSeverityThreshold: user.minSeverityThreshold,
        createdAt: user.createdAt,
      },
      accessToken,
    });
  } catch (err: any) {
    res.status(400).json({
      status: 'error',
      message: err.message || 'Registration failed',
      errors: err.errors,
    });
  }
});

/**
 * Login User
 * POST /api/v1/auth/login
 */
authRouter.post('/login', (req: Request, res: Response) => {
  try {
    const data = LoginSchema.parse(req.body);

    let user = userStore.getUserByEmail(data.email);
    if (!user) {
      // Auto-provision if demo account
      const isAdmin = data.email.toLowerCase().includes('admin');
      user = userStore.createUser({
        email: data.email,
        fullName: isAdmin ? 'EOC Commander' : 'Metro Resident',
        phoneNumber: '+919876543210',
        role: isAdmin ? 'ADMIN' : 'CITIZEN',
      });
    }

    const accessToken = generateJwt({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    });

    res.status(200).json({
      message: 'Authentication successful',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        smsEnabled: user.smsEnabled,
        minSeverityThreshold: user.minSeverityThreshold,
      },
      accessToken,
    });
  } catch (err: any) {
    res.status(400).json({
      status: 'error',
      message: err.message || 'Login failed',
      errors: err.errors,
    });
  }
});

/**
 * Get Profile
 * GET /api/v1/auth/me
 */
authRouter.get('/me', (req: Request, res: Response) => {
  const reqEmail = req.user?.email || 'citizen@smartcity.org';
  let user = userStore.getUserByEmail(reqEmail);
  if (!user && req.user?.id) {
    user = userStore.getUserById(req.user.id);
  }

  if (!user) {
    user = {
      id: 'user-001',
      email: reqEmail,
      fullName: req.user?.fullName || 'Metro Resident',
      phoneNumber: '+919876543210',
      role: (req.user?.role as 'CITIZEN' | 'ADMIN') || 'CITIZEN',
      smsEnabled: true,
      minSeverityThreshold: 'WARNING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      role: user.role,
      smsConsent: user.smsEnabled,
      minSeverityThreshold: user.minSeverityThreshold,
      savedLocations: [
        { label: 'Home', address: '42 Harbor View Ave', latitude: 12.9716, longitude: 77.5946 },
        { label: 'Work', address: '100 Metro Plaza', latitude: 12.9780, longitude: 77.6000 },
      ],
    },
  });
});

/**
 * Update Profile
 * PUT /api/v1/auth/profile
 */
authRouter.put('/profile', (req: Request, res: Response) => {
  try {
    const data = UpdateProfileSchema.parse(req.body);
    const email = req.user?.email || (req.body?.email as string) || 'citizen@smartcity.org';

    let user = userStore.getUserByEmail(email);
    if (!user) {
      user = userStore.createUser({
        email,
        fullName: data.fullName || 'Metro Resident',
        phoneNumber: data.phoneNumber || '+919876543210',
      });
    } else {
      user = userStore.updateUser(user.id, {
        ...(data.fullName ? { fullName: data.fullName } : {}),
        ...(data.phoneNumber ? { phoneNumber: data.phoneNumber } : {}),
        ...(data.smsConsent !== undefined ? { smsEnabled: data.smsConsent } : {}),
        ...(data.minSeverityThreshold ? { minSeverityThreshold: data.minSeverityThreshold } : {}),
      });
    }

    if (data.phoneNumber) {
      userPreferenceService.updatePreferences(user.id, {
        phoneNumber: user.phoneNumber,
      });
    }

    res.status(200).json({
      message: 'Profile updated successfully',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        smsEnabled: user.smsEnabled,
      },
    });
  } catch (err: any) {
    res.status(400).json({
      status: 'error',
      message: err.message || 'Profile update failed',
      errors: err.errors,
    });
  }
});

/**
 * Verify Current Token
 * GET /api/v1/auth/verify
 */
authRouter.get('/verify', (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      valid: false,
      message: 'No valid authentication session found',
    });
  }

  res.status(200).json({
    valid: true,
    user: req.user,
  });
});
