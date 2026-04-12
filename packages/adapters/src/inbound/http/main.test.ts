import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock, enableCorsMock, listenMock, fastifyAdapterMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  enableCorsMock: vi.fn(),
  listenMock: vi.fn(),
  fastifyAdapterMock: vi.fn(),
}));

vi.mock('@nestjs/core', () => ({
  NestFactory: {
    create: createMock,
  },
}));

vi.mock('@nestjs/platform-fastify', () => ({
  FastifyAdapter: fastifyAdapterMock,
}));

vi.mock('./AppModule.js', () => ({
  AppModule: class AppModule {},
}));

import { bootstrap } from './main.js';

describe('http bootstrap', () => {
  beforeEach(() => {
    createMock.mockReset();
    enableCorsMock.mockReset();
    listenMock.mockReset();
    fastifyAdapterMock.mockReset();

    fastifyAdapterMock.mockImplementation(() => ({ kind: 'fastify-adapter' }));
    createMock.mockResolvedValue({
      enableCors: enableCorsMock,
      listen: listenMock,
    });
  });

  it('creates the Nest app with a Fastify adapter', async () => {
    await bootstrap();

    expect(fastifyAdapterMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith(expect.any(Function), expect.any(Object));
    expect(enableCorsMock).toHaveBeenCalledTimes(1);
    expect(listenMock).toHaveBeenCalledWith(3001, '0.0.0.0');
  });
});
