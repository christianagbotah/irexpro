import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  PAID = 'PAID',
  VOID = 'VOID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

@Entity({ name: 'invoices', schema: 'payments' })
@Index(['userId', 'createdAt'])
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @Column({ name: 'subscription_id', type: 'uuid', nullable: true })
  subscriptionId: string | null;

  @Column({ name: 'invoice_number', type: 'varchar', length: 50, unique: true })
  @Index()
  invoiceNumber: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: InvoiceStatus,
    default: InvoiceStatus.DRAFT,
  })
  @Index()
  status: InvoiceStatus;

  @Column({ name: 'currency', type: 'varchar', length: 3 })
  currency: string;

  /** All monetary amounts stored in smallest currency unit (e.g. cents) as bigint string */
  @Column({ name: 'subtotal_amount', type: 'bigint', default: '0' })
  subtotalAmount: string;

  @Column({ name: 'tax_amount', type: 'bigint', default: '0' })
  taxAmount: string;

  @Column({ name: 'total_amount', type: 'bigint', default: '0' })
  totalAmount: string;

  @Column({ name: 'due_date', type: 'timestamptz', nullable: true })
  dueDate: Date | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  @Index()
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
