import { PortfolioController } from './portfolio.controller';
import { PortfolioReadService } from './services/portfolio-read.service';

describe('PortfolioController', () => {
  const USER_ID = '11111111-1111-4111-8111-111111111111';

  it('passes only the authenticated user ID into portfolio reads', async () => {
    const readService = {
      listAccounts: jest.fn().mockResolvedValue([]),
    };
    const controller = new PortfolioController(
      readService as unknown as PortfolioReadService,
    );

    await controller.listAccounts(USER_ID);

    expect(readService.listAccounts).toHaveBeenCalledWith(USER_ID);
  });
});
