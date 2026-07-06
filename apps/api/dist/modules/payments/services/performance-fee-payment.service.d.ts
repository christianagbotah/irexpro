import { Repository } from 'typeorm';
import { Invoice, InvoiceStatus } from '../entities/invoice.entity';
import { PaymentTransaction, PaymentTransactionStatus } from '../entities/payment-transaction.entity';
import { PerformanceFeeAssessment, AssessmentStatus } from '../../performance-fees/entities/performance-fee-assessment.entity';
import { User } from '../../users/entities/user.entity';
import { PaymentRoutingService } from './payment-routing.service';
import { AuditService } from '../../audit/audit.service';
export interface PerformanceFeeCheckoutOptions {
    provider?: string;
    countryCode?: string;
    currency?: string;
}
export interface InitiateCheckoutParams {
    invoiceId: string;
    requestingUserId: string;
    isAdmin: boolean;
    options?: PerformanceFeeCheckoutOptions;
    ipAddress?: string;
}
export interface PerformanceFeeCheckoutResult {
    invoiceId: string;
    invoiceNumber: string;
    transactionId: string;
    provider: string;
    paymentStatus: PaymentTransactionStatus;
    checkoutUrl?: string;
    sessionId?: string;
    providerReference?: string;
    reusedExistingSession: boolean;
}
export interface PerformanceFeeInvoiceView {
    invoiceId: string;
    invoiceNumber: string;
    status: InvoiceStatus;
    currency: string;
    totalAmount: string;
    dueDate: Date | null;
    paidAt: Date | null;
    assessmentId: string | null;
    assessmentStatus: AssessmentStatus | null;
    paymentStatus: PaymentTransactionStatus | 'NONE';
    provider: string | null;
    checkoutSessionId: string | null;
    manual: boolean;
    createdAt: Date;
}
export declare class PerformanceFeePaymentService {
    private readonly invoiceRepo;
    private readonly transactionRepo;
    private readonly assessmentRepo;
    private readonly userRepo;
    private readonly routingService;
    private readonly auditService;
    private readonly logger;
    constructor(invoiceRepo: Repository<Invoice>, transactionRepo: Repository<PaymentTransaction>, assessmentRepo: Repository<PerformanceFeeAssessment>, userRepo: Repository<User>, routingService: PaymentRoutingService, auditService: AuditService);
    initiatePerformanceFeeCheckout(params: InitiateCheckoutParams): Promise<PerformanceFeeCheckoutResult>;
    getInvoiceView(invoiceId: string, requestingUserId: string, isAdmin: boolean): Promise<PerformanceFeeInvoiceView>;
    getPerformanceFeePaymentStatus(invoiceId: string, requestingUserId: string, isAdmin: boolean, ipAddress?: string): Promise<PerformanceFeeInvoiceView>;
    listUserPerformanceFeeInvoices(userId: string, filters?: {
        status?: InvoiceStatus;
        limit?: number;
    }): Promise<PerformanceFeeInvoiceView[]>;
    private loadPayableContext;
    private assertOwnership;
    private assertPerformanceFeeInvoice;
    private buildReuseResult;
    private findPerformanceFeeTransaction;
    private toInvoiceView;
    private toAmountMinor;
    private safeMessage;
}
