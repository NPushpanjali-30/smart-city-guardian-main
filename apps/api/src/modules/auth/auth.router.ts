import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { generateJwt } from '../../utils/jwt.js';

export const authRouter = Router();

const RegisterSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  phoneNumber: z.string().min(10),
  password: z.string().min(8),
  smsConsent: z.boolean().default(true),
  minSeverityThreshold: z.enum(['WATCH', 'WARNING', 'CRITICAL']).default('WARNING'),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Register User
 * POST /api/v1/auth/register
 */
authRouter.post('/register', (req: Request, res: Response) => {
  const data = RegisterSchema.parse(req.body);

  const mockUser = {
    id: 'user-001',
    email: data.email,
    fullName: data.fullName,
    phoneNumber: data.phoneNumber,
    role: 'CITIZEN' as const,
    smsEnabled: data.smsConsent,
    minSeverityThreshold: data.minSeverityThreshold,
    createdAt: new Date().toISOString(),
  };

  const accessToken = generateJwt({
    id: mockUser.id,
    email: mockUser.email,
    fullName: mockUser.fullName,
    role: 'CITIZEN',
  });

  res.status(201).json({
    message: 'User registered successfully',
    user: mockUser,
    accessToken,
  });
});

/**
 * Login User
 * POST /api/v1/auth/login
 */
authRouter.post('/login', (req: Request, res: Response) => {
  const data = LoginSchema.parse(req.body);

  const isAdmin = data.email.includes('admin');
  const role: 'ADMIN' | 'CITIZEN' = isAdmin ? 'ADMIN' : 'CITIZEN';
  const userId = isAdmin ? 'admin-001' : 'user-001';
  const fullName = isAdmin ? 'EOC Commander' : 'Metro Resident';

  const accessToken = generateJwt({
    id: userId,
    email: data.email,
    fullName,
    role,
  });

  res.status(200).json({
    message: 'Authentication successful',
    user: {
      id: userId,
      email: data.email,
      fullName,
      role,
    },
    accessToken,
  });
});

/**
 * Get Profile
 * GET /api/v1/auth/me
 */
authRouter.get('/me', (req: Request, res: Response) => {
  const activeUser = req.user || {
    id: 'user-001',
    email: 'citizen@smartcity.org',
    fullName: 'Metro Resident',
    role: 'CITIZEN' as const,
  };

  res.status(200).json({
    user: {
      id: activeUser.id,
      email: activeUser.email,
      fullName: activeUser.fullName || 'Metro Resident',
      phoneNumber: '+1 (555) 019-2834',
      role: activeUser.role,
      smsConsent: true,
      savedLocations: [
        { label: 'Home', address: '42 Harbor View Ave', latitude: 40.718, longitude: -74.015 },
        { label: 'Work', address: '100 Metro Plaza', latitude: 40.732, longitude: -74.005 },
      ],
    },
  });
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

