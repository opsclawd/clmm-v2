export class ReconciliationJobHandler {
  static readonly JOB_NAME = 'reconciliation';

  async handle(_data: { attemptId: string }): Promise<void> {
    console.log('ReconciliationJobHandler: stub');
  }
}
