export declare enum InvoiceStatus {
    DRAFT = "DRAFT",
    ISSUED = "ISSUED",
    PAID = "PAID",
    VOID = "VOID",
    OVERDUE = "OVERDUE",
    CANCELLED = "CANCELLED"
}
export declare class Invoice {
    id: string;
    userId: string;
    subscriptionId: string | null;
    invoiceNumber: string;
    status: InvoiceStatus;
    currency: string;
    subtotalAmount: string;
    taxAmount: string;
    totalAmount: string;
    dueDate: Date | null;
    paidAt: Date | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
}
