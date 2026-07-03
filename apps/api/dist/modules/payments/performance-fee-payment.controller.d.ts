import { RoleName } from '../users/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { InvoiceStatus } from './entities/invoice.entity';
import { PerformanceFeePaymentService } from './services/performance-fee-payment.service';
import { InitiatePerformanceFeeCheckoutDto } from './dto/initiate-performance-fee-checkout.dto';
type RequestUser = User & {
    roles?: RoleName[];
};
export declare class PerformanceFeePaymentController {
    private readonly svc;
    constructor(svc: PerformanceFeePaymentService);
    private isAdmin;
    listInvoices(user: RequestUser, queryUserId?: string, status?: InvoiceStatus, limit?: string): Promise<import("./services/performance-fee-payment.service").PerformanceFeeInvoiceView[]>;
    getInvoice(invoiceId: string, user: RequestUser): Promise<import("./services/performance-fee-payment.service").PerformanceFeeInvoiceView>;
    initiateCheckout(invoiceId: string, dto: InitiatePerformanceFeeCheckoutDto, user: RequestUser, req: {
        ip?: string;
    }): Promise<import("./services/performance-fee-payment.service").PerformanceFeeCheckoutResult>;
    getPaymentStatus(invoiceId: string, user: RequestUser, req: {
        ip?: string;
    }): Promise<import("./services/performance-fee-payment.service").PerformanceFeeInvoiceView>;
}
export {};
