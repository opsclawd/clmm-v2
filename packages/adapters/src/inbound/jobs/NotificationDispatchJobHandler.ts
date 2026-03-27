export class NotificationDispatchJobHandler {
  static readonly JOB_NAME = 'notification-dispatch';

  async handle(_data: { walletId: string }): Promise<void> {
    console.log('NotificationDispatchJobHandler: stub');
  }
}
