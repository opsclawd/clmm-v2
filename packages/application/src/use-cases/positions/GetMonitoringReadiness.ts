import type { NotificationPermissionPort, PlatformCapabilityPort } from '../../ports/index.js';
import type { MonitoringReadinessDto } from '../../dto/index.js';

export async function getMonitoringReadiness(params: {
  permissionPort: NotificationPermissionPort;
  capabilityPort: PlatformCapabilityPort;
}): Promise<MonitoringReadinessDto> {
  const { permissionPort, capabilityPort } = params;

  const [notificationPermission, platformCapabilities] = await Promise.all([
    permissionPort.getPermissionState(),
    capabilityPort.getCapabilities(),
  ]);

  const monitoringActive = notificationPermission === 'granted';

  return {
    notificationPermission,
    platformCapabilities,
    monitoringActive,
  };
}
