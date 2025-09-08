import Dexie, { Table } from 'dexie';
import { Project, Session, VideoMetadata, AnimationData } from '@/types';
import { ProcessedVideo, CaptureType } from '@/types/video';
import { 
  LandmarkerType, 
  BatchLandmarkerResult, 
  ModelComparison, 
  LandmarkerResult, 
  LandmarkerPerformance 
} from '@/types/landmarker';

// Extended database interfaces
export interface StoredLandmarkerResult extends BatchLandmarkerResult {
  id?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredModelComparison extends ModelComparison {
  id?: string;
  videoName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredAnimationData {
  id?: string;
  videoId: string;
  landmarkerType: LandmarkerType;
  landmarkerResultId: string;
  animationData: any; // Processed animation data from pipeline
  exportFormats: {
    json?: string;
    bvh?: string;
    fbx?: ArrayBuffer;
  };
  processingTime: number;
  qualityScore: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredProcessingSession {
  id?: string;
  videoId: string;
  landmarkerTypes: LandmarkerType[];
  results: string[]; // IDs of StoredLandmarkerResult
  comparison?: string; // ID of StoredModelComparison
  animationData?: string[]; // IDs of StoredAnimationData
  status: 'processing' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  totalProcessingTime?: number;
  createdAt: Date;
  updatedAt: Date;
}

export class MotionCaptureDB extends Dexie {
  // Tables
  projects!: Table<Project>;
  sessions!: Table<Session>;
  processedVideos!: Table<ProcessedVideo>;
  landmarkerResults!: Table<StoredLandmarkerResult>;
  modelComparisons!: Table<StoredModelComparison>;
  animationData!: Table<StoredAnimationData>;
  processingSessions!: Table<StoredProcessingSession>;
  
  constructor() {
    super('MotionCaptureDB');
    
    // Version 1: Original schema
    this.version(1).stores({
      projects: '++id, name, createdAt, updatedAt',
      sessions: '++id, name, projectId, status, createdAt',
      processedVideos: '++id, captureType, processedAt, status'
    });

    // Version 2: Add AI processing tables
    this.version(2).stores({
      projects: '++id, name, createdAt, updatedAt',
      sessions: '++id, name, projectId, status, createdAt', 
      processedVideos: '++id, captureType, processedAt, status',
      landmarkerResults: '++id, videoId, landmarkerType, createdAt',
      modelComparisons: '++id, videoId, videoName, createdAt',
      animationData: '++id, videoId, landmarkerType, landmarkerResultId, createdAt',
      processingSessions: '++id, videoId, status, createdAt, updatedAt'
    });
  }
}

export const db = new MotionCaptureDB();

// Database utility functions
export class DatabaseService {
  static async createProject(name: string, description: string = ''): Promise<Project> {
    const now = new Date();
    const project: Omit<Project, 'id'> = {
      name,
      description,
      createdAt: now,
      updatedAt: now,
      sessions: []
    };
    
    const id = await db.projects.add(project as Project);
    return { ...project, id: String(id) };
  }
  
  static async getProjects(): Promise<Project[]> {
    return await db.projects.orderBy('updatedAt').reverse().toArray();
  }
  
  static async getProject(id: string): Promise<Project | undefined> {
    return await db.projects.get(id);
  }
  
  static async updateProject(id: string, updates: Partial<Project>): Promise<void> {
    await db.projects.update(id, { ...updates, updatedAt: new Date() });
  }
  
  static async deleteProject(id: string): Promise<void> {
    await db.transaction('rw', db.projects, db.sessions, async () => {
      await db.sessions.where('projectId').equals(id).delete();
      await db.projects.delete(id);
    });
  }
  
  static async createSession(
    projectId: string,
    name: string,
    videoFile: Blob,
    thumbnail: Blob,
    metadata: VideoMetadata
  ): Promise<Session> {
    const session: Omit<Session, 'id'> = {
      name,
      videoFile,
      thumbnail,
      metadata,
      status: 'pending',
      createdAt: new Date()
    };
    
    const id = await db.sessions.add(session as Session);
    return { ...session, id: String(id) };
  }
  
  static async getSessions(projectId?: string): Promise<Session[]> {
    if (projectId) {
      return await db.sessions.where('projectId').equals(projectId).toArray();
    }
    return await db.sessions.orderBy('createdAt').reverse().toArray();
  }
  
  static async updateSession(id: string, updates: Partial<Session>): Promise<void> {
    await db.sessions.update(id, updates);
  }
  
  static async deleteSession(id: string): Promise<void> {
    await db.sessions.delete(id);
  }
  
  static async getStorageUsage(): Promise<{ used: number; available: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        available: (estimate.quota || 0) - (estimate.usage || 0)
      };
    }
    
    return { used: 0, available: Infinity };
  }
  
  static async clearCache(): Promise<void> {
    await db.transaction('rw', db.projects, db.sessions, db.processedVideos, async () => {
      await db.sessions.clear();
      await db.projects.clear();
      await db.processedVideos.clear();
    });
  }

  // Processed Video Methods
  static async storeProcessedVideo(processedVideo: ProcessedVideo): Promise<string> {
    const id = await db.processedVideos.add(processedVideo);
    return String(id);
  }

  static async getProcessedVideos(options?: {
    captureType?: CaptureType;
    limit?: number;
    offset?: number;
  }): Promise<ProcessedVideo[]> {
    let query = db.processedVideos.orderBy('processedAt').reverse();

    if (options?.captureType) {
      query = query.filter(video => video.captureType === options.captureType);
    }

    if (options?.offset) {
      query = query.offset(options.offset);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    return await query.toArray();
  }

  static async getProcessedVideo(id: string): Promise<ProcessedVideo | undefined> {
    return await db.processedVideos.get(id);
  }

  static async updateProcessedVideo(id: string, updates: Partial<ProcessedVideo>): Promise<void> {
    await db.processedVideos.update(id, updates);
  }

  static async deleteProcessedVideo(id: string): Promise<void> {
    await db.processedVideos.delete(id);
  }

  static async getProcessedVideosByProject(projectId: string): Promise<ProcessedVideo[]> {
    // In a more complex implementation, you'd have a projectId field in ProcessedVideo
    // For now, return all processed videos
    return await db.processedVideos.orderBy('processedAt').reverse().toArray();
  }

  static async getProcessedVideosStats(): Promise<{
    total: number;
    byType: Record<CaptureType, number>;
    totalSize: number;
  }> {
    const videos = await db.processedVideos.toArray();
    
    const stats = {
      total: videos.length,
      byType: {
        pose: 0,
        hand: 0,
        face: 0,
        holistic: 0
      } as Record<CaptureType, number>,
      totalSize: 0
    };

    videos.forEach(video => {
      stats.byType[video.captureType]++;
      stats.totalSize += video.originalFile.size;
    });

    return stats;
  }

  static async cleanupOldProcessedVideos(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const oldVideos = await db.processedVideos
      .where('processedAt')
      .below(cutoffDate)
      .toArray();

    if (oldVideos.length > 0) {
      await db.processedVideos
        .where('processedAt')
        .below(cutoffDate)
        .delete();
    }

    return oldVideos.length;
  }

  // AI Processing - Landmarker Results Methods
  static async storeLandmarkerResult(result: BatchLandmarkerResult): Promise<string> {
    const now = new Date();
    const storedResult: Omit<StoredLandmarkerResult, 'id'> = {
      ...result,
      createdAt: now,
      updatedAt: now
    };
    
    const id = await db.landmarkerResults.add(storedResult as StoredLandmarkerResult);
    return String(id);
  }

  static async getLandmarkerResults(options?: {
    videoId?: string;
    landmarkerType?: LandmarkerType;
    limit?: number;
    offset?: number;
  }): Promise<StoredLandmarkerResult[]> {
    let query = db.landmarkerResults.orderBy('createdAt').reverse();

    if (options?.videoId) {
      query = query.filter(result => result.videoId === options.videoId);
    }

    if (options?.landmarkerType) {
      query = query.filter(result => result.landmarkerType === options.landmarkerType);
    }

    if (options?.offset) {
      query = query.offset(options.offset);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    return await query.toArray();
  }

  static async getLandmarkerResult(id: string): Promise<StoredLandmarkerResult | undefined> {
    return await db.landmarkerResults.get(id);
  }

  static async updateLandmarkerResult(id: string, updates: Partial<StoredLandmarkerResult>): Promise<void> {
    await db.landmarkerResults.update(id, { ...updates, updatedAt: new Date() });
  }

  static async deleteLandmarkerResult(id: string): Promise<void> {
    await db.landmarkerResults.delete(id);
  }

  // Model Comparison Methods
  static async storeModelComparison(comparison: ModelComparison, videoName: string): Promise<string> {
    const now = new Date();
    const storedComparison: Omit<StoredModelComparison, 'id'> = {
      ...comparison,
      videoName,
      createdAt: now,
      updatedAt: now
    };
    
    const id = await db.modelComparisons.add(storedComparison as StoredModelComparison);
    return String(id);
  }

  static async getModelComparisons(options?: {
    videoId?: string;
    limit?: number;
    offset?: number;
  }): Promise<StoredModelComparison[]> {
    let query = db.modelComparisons.orderBy('createdAt').reverse();

    if (options?.videoId) {
      query = query.filter(comp => comp.videoId === options.videoId);
    }

    if (options?.offset) {
      query = query.offset(options.offset);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    return await query.toArray();
  }

  static async getModelComparison(id: string): Promise<StoredModelComparison | undefined> {
    return await db.modelComparisons.get(id);
  }

  static async deleteModelComparison(id: string): Promise<void> {
    await db.modelComparisons.delete(id);
  }

  // Animation Data Methods
  static async storeAnimationData(
    videoId: string,
    landmarkerType: LandmarkerType,
    landmarkerResultId: string,
    animationData: any,
    exportFormats: StoredAnimationData['exportFormats'],
    processingTime: number,
    qualityScore: number
  ): Promise<string> {
    const now = new Date();
    const storedAnimation: Omit<StoredAnimationData, 'id'> = {
      videoId,
      landmarkerType,
      landmarkerResultId,
      animationData,
      exportFormats,
      processingTime,
      qualityScore,
      createdAt: now,
      updatedAt: now
    };
    
    const id = await db.animationData.add(storedAnimation as StoredAnimationData);
    return String(id);
  }

  static async getAnimationData(options?: {
    videoId?: string;
    landmarkerType?: LandmarkerType;
    landmarkerResultId?: string;
    limit?: number;
    offset?: number;
  }): Promise<StoredAnimationData[]> {
    let query = db.animationData.orderBy('createdAt').reverse();

    if (options?.videoId) {
      query = query.filter(data => data.videoId === options.videoId);
    }

    if (options?.landmarkerType) {
      query = query.filter(data => data.landmarkerType === options.landmarkerType);
    }

    if (options?.landmarkerResultId) {
      query = query.filter(data => data.landmarkerResultId === options.landmarkerResultId);
    }

    if (options?.offset) {
      query = query.offset(options.offset);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    return await query.toArray();
  }

  static async getAnimationDataById(id: string): Promise<StoredAnimationData | undefined> {
    return await db.animationData.get(id);
  }

  static async updateAnimationData(id: string, updates: Partial<StoredAnimationData>): Promise<void> {
    await db.animationData.update(id, { ...updates, updatedAt: new Date() });
  }

  static async deleteAnimationData(id: string): Promise<void> {
    await db.animationData.delete(id);
  }

  // Processing Session Methods
  static async createProcessingSession(
    videoId: string,
    landmarkerTypes: LandmarkerType[]
  ): Promise<string> {
    const now = new Date();
    const session: Omit<StoredProcessingSession, 'id'> = {
      videoId,
      landmarkerTypes,
      results: [],
      status: 'processing',
      startTime: now,
      createdAt: now,
      updatedAt: now
    };
    
    const id = await db.processingSessions.add(session as StoredProcessingSession);
    return String(id);
  }

  static async updateProcessingSession(
    id: string,
    updates: Partial<StoredProcessingSession>
  ): Promise<void> {
    await db.processingSessions.update(id, {
      ...updates,
      updatedAt: new Date()
    });
  }

  static async completeProcessingSession(
    id: string,
    results: string[],
    comparisonId?: string,
    animationDataIds?: string[]
  ): Promise<void> {
    const now = new Date();
    const session = await db.processingSessions.get(id);
    
    if (session) {
      const totalTime = now.getTime() - session.startTime.getTime();
      
      await db.processingSessions.update(id, {
        results,
        comparison: comparisonId,
        animationData: animationDataIds,
        status: 'completed',
        endTime: now,
        totalProcessingTime: totalTime,
        updatedAt: now
      });
    }
  }

  static async failProcessingSession(id: string): Promise<void> {
    const now = new Date();
    await db.processingSessions.update(id, {
      status: 'failed',
      endTime: now,
      updatedAt: now
    });
  }

  static async getProcessingSessions(options?: {
    videoId?: string;
    status?: StoredProcessingSession['status'];
    limit?: number;
    offset?: number;
  }): Promise<StoredProcessingSession[]> {
    let query = db.processingSessions.orderBy('createdAt').reverse();

    if (options?.videoId) {
      query = query.filter(session => session.videoId === options.videoId);
    }

    if (options?.status) {
      query = query.filter(session => session.status === options.status);
    }

    if (options?.offset) {
      query = query.offset(options.offset);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    return await query.toArray();
  }

  static async getProcessingSession(id: string): Promise<StoredProcessingSession | undefined> {
    return await db.processingSessions.get(id);
  }

  static async deleteProcessingSession(id: string): Promise<void> {
    // Also delete associated results if needed
    const session = await db.processingSessions.get(id);
    if (session) {
      // Delete associated data
      if (session.results) {
        await Promise.all(session.results.map(resultId => 
          db.landmarkerResults.delete(resultId)
        ));
      }
      
      if (session.comparison) {
        await db.modelComparisons.delete(session.comparison);
      }
      
      if (session.animationData) {
        await Promise.all(session.animationData.map(dataId => 
          db.animationData.delete(dataId)
        ));
      }
    }
    
    await db.processingSessions.delete(id);
  }

  // Enhanced Statistics Methods
  static async getAIProcessingStats(): Promise<{
    totalSessions: number;
    completedSessions: number;
    failedSessions: number;
    totalLandmarkerResults: number;
    resultsByType: Record<LandmarkerType, number>;
    totalAnimationData: number;
    totalStorageUsed: number;
    avgProcessingTime: number;
    avgQualityScore: number;
  }> {
    const [sessions, results, animations] = await Promise.all([
      db.processingSessions.toArray(),
      db.landmarkerResults.toArray(),
      db.animationData.toArray()
    ]);

    const completedSessions = sessions.filter(s => s.status === 'completed');
    const failedSessions = sessions.filter(s => s.status === 'failed');

    const resultsByType = {
      pose: 0,
      hand: 0,
      face: 0,
      holistic: 0
    } as Record<LandmarkerType, number>;

    results.forEach(result => {
      resultsByType[result.landmarkerType]++;
    });

    const avgProcessingTime = completedSessions.length > 0
      ? completedSessions.reduce((sum, s) => sum + (s.totalProcessingTime || 0), 0) / completedSessions.length
      : 0;

    const avgQualityScore = animations.length > 0
      ? animations.reduce((sum, a) => sum + a.qualityScore, 0) / animations.length
      : 0;

    // Estimate storage usage (simplified)
    const totalStorageUsed = results.length * 1024 + animations.length * 2048; // Rough estimate

    return {
      totalSessions: sessions.length,
      completedSessions: completedSessions.length,
      failedSessions: failedSessions.length,
      totalLandmarkerResults: results.length,
      resultsByType,
      totalAnimationData: animations.length,
      totalStorageUsed,
      avgProcessingTime,
      avgQualityScore
    };
  }

  // Cleanup Methods for AI Data
  static async cleanupAIProcessingData(daysOld: number = 30): Promise<{
    deletedSessions: number;
    deletedResults: number;
    deletedComparisons: number;
    deletedAnimations: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const [oldSessions, oldResults, oldComparisons, oldAnimations] = await Promise.all([
      db.processingSessions.where('createdAt').below(cutoffDate).toArray(),
      db.landmarkerResults.where('createdAt').below(cutoffDate).toArray(),
      db.modelComparisons.where('createdAt').below(cutoffDate).toArray(),
      db.animationData.where('createdAt').below(cutoffDate).toArray()
    ]);

    // Delete old data
    await Promise.all([
      db.processingSessions.where('createdAt').below(cutoffDate).delete(),
      db.landmarkerResults.where('createdAt').below(cutoffDate).delete(),
      db.modelComparisons.where('createdAt').below(cutoffDate).delete(),
      db.animationData.where('createdAt').below(cutoffDate).delete()
    ]);

    return {
      deletedSessions: oldSessions.length,
      deletedResults: oldResults.length,
      deletedComparisons: oldComparisons.length,
      deletedAnimations: oldAnimations.length
    };
  }

  // Enhanced cache clearing
  static async clearAllCache(): Promise<void> {
    await db.transaction('rw', 
      db.projects, 
      db.sessions, 
      db.processedVideos, 
      db.landmarkerResults, 
      db.modelComparisons, 
      db.animationData, 
      db.processingSessions, 
      async () => {
        await Promise.all([
          db.sessions.clear(),
          db.projects.clear(),
          db.processedVideos.clear(),
          db.landmarkerResults.clear(),
          db.modelComparisons.clear(),
          db.animationData.clear(),
          db.processingSessions.clear()
        ]);
      }
    );
  }
}