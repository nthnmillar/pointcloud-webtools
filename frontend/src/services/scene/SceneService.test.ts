import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { NullEngine, Engine, Scene } from '@babylonjs/core';
import { SceneService } from './SceneService';

/**
 * Tests for SceneService using Babylon.js NullEngine
 * NullEngine allows testing 3D rendering code without a browser/WebGL context
 * Tests access the actual scene created by SceneService
 */

describe('SceneService', () => {
  let service: SceneService;
  let nullEngine: NullEngine;
  let engine: Engine | null;
  let scene: Scene | null;

  beforeEach(async () => {
    service = new SceneService();
    nullEngine = new NullEngine();
    await service.initialize(undefined, nullEngine);
    engine = service.engine;
    scene = service.scene;
  });

  afterEach(() => {
    service.dispose();
    nullEngine.dispose();
  });

  test('should initialize successfully with NullEngine', () => {
    expect(service.initialized).toBe(true);
    expect(service.isWebGLReady).toBe(true);
    expect(engine).toBeDefined();
    expect(scene).toBeDefined();
  });

  test('should create engine and scene', () => {
    expect(engine).not.toBeNull();
    expect(scene).not.toBeNull();
    expect(scene?.getEngine()).toBe(engine);
  });

  test('should set scene background color', () => {
    expect(scene).not.toBeNull();
    expect(scene?.clearColor.r).toBeCloseTo(0.1, 2);
    expect(scene?.clearColor.g).toBeCloseTo(0.1, 2);
    expect(scene?.clearColor.b).toBeCloseTo(0.1, 2);
    expect(scene?.clearColor.a).toBeCloseTo(1.0, 2);
  });

  test('should create hemispheric light in scene', () => {
    expect(scene).not.toBeNull();

    const lights = scene?.lights || [];
    expect(lights.length).toBeGreaterThan(0);

    const hemisphericLight = lights.find(
      light => light.getClassName() === 'HemisphericLight'
    );
    expect(hemisphericLight).toBeDefined();
    expect(hemisphericLight?.intensity).toBeCloseTo(0.7, 2);
  });

  test('should access scene elements through chaining', () => {
    expect(scene).not.toBeNull();

    expect(scene?.getEngine()).toBe(engine);
    expect(scene?.lights.length).toBeGreaterThan(0);
    expect(scene?.meshes.length).toBeGreaterThanOrEqual(0);
  });

  test('should dispose resources correctly', () => {
    expect(engine).not.toBeNull();
    expect(scene).not.toBeNull();

    service.dispose();

    expect(service.engine).toBeNull();
    expect(service.scene).toBeNull();
    expect(service.isWebGLReady).toBe(false);
    expect(service.initialized).toBe(false);
  });

  test('should emit initialized event', async () => {
    const testService = new SceneService();
    let initializedEmitted = false;

    testService.on('initialized', () => {
      initializedEmitted = true;
    });

    await testService.initialize(undefined, nullEngine);

    expect(initializedEmitted).toBe(true);
    testService.dispose();
  });

  test('should handle multiple initializations', async () => {
    const firstEngine = engine;
    const firstScene = scene;

    service.dispose();
    const newNullEngine = new NullEngine();
    await service.initialize(undefined, newNullEngine);

    expect(service.engine).not.toBe(firstEngine);
    expect(service.scene).not.toBe(firstScene);
    engine = service.engine;
    scene = service.scene;

    newNullEngine.dispose();
  });
});
