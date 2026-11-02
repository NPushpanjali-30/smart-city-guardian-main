import { Router, Request, Response } from 'express';
import { CitizenReportInputSchema } from '@smartcity/shared';

export const reportsRouter = Router();

interface StoredReport {
  id: string;
  category: string;
  description: string;
  latitude: number;
  longitude: number;
  photoUrl?: string;
  status: 'PENDING_REVIEW' | 'VERIFIED' | 'DISMISSED';
  createdAt: string;
}

const IN_MEMORY_REPORTS: StoredReport[] = [
  {
    id: 'rep-001',
    category: 'FLOOD',
    description: 'Deep standing water over 25cm near the Bay Street overpass. Cars are unable to pass.',
    latitude: 40.715,
    longitude: -74.008,
    status: 'VERIFIED',
    createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
  },
  {
    id: 'rep-002',
    category: 'ROAD_BLOCKED',
    description: 'Fallen branch blocking storm drain on Market Street right lane.',
    latitude: 40.721,
    longitude: -74.008,
    status: 'PENDING_REVIEW',
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  },
];

/**
 * Submit Citizen Hazard Report
 * POST /api/v1/reports
 */
reportsRouter.post('/', (req: Request, res: Response) => {
  const validated = CitizenReportInputSchema.parse(req.body);

  const newReport: StoredReport = {
    id: `rep-${Date.now()}`,
    category: validated.category,
    description: validated.description,
    latitude: validated.latitude,
    longitude: validated.longitude,
    photoUrl: validated.photoUrl,
    status: 'PENDING_REVIEW',
    createdAt: new Date().toISOString(),
  };

  IN_MEMORY_REPORTS.unshift(newReport);

  res.status(201).json({
    status: 'ok',
    message: 'Citizen report received and placed in verification queue',
    data: newReport,
  });
});

/**
 * List Citizen Reports
 * GET /api/v1/reports
 */
reportsRouter.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    count: IN_MEMORY_REPORTS.length,
    data: IN_MEMORY_REPORTS,
  });
});
