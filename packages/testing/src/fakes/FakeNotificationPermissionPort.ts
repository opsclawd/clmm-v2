import type { NotificationPermissionPort } from '@clmm/application';

type PermissionState = 'granted' | 'denied' | 'undetermined';
type RequestResult = 'granted' | 'denied';

export class FakeNotificationPermissionPort implements NotificationPermissionPort {
  private _state: PermissionState = 'undetermined';
  private _requestResult: RequestResult = 'granted';

  setState(state: PermissionState): void {
    this._state = state;
  }

  setRequestResult(result: RequestResult): void {
    this._requestResult = result;
  }

  async getPermissionState(): Promise<PermissionState> {
    return this._state;
  }

  async requestPermission(): Promise<RequestResult> {
    this._state = this._requestResult;
    return this._requestResult;
  }
}
