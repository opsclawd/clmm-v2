export class TriggerQualificationJobHandler {
  static readonly JOB_NAME = 'trigger-qualification';

  async handle(_data: { walletId: string }): Promise<void> {
    console.log('TriggerQualificationJobHandler: stub');
  }
}
