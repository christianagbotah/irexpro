import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BrokerConnection } from './broker-connection.entity';

/**
 * BrokerAccount — synced snapshot of the live broker account state.
 *
 * This entity is updated by BrokerHealthCheckJob and account sync operations.
 * All monetary values are stored as decimal strings — never floats.
 *
 * See: docs/architecture/09-broker-integration-architecture.md §7
 */
@Entity({ name: 'broker_accounts', schema: 'broker' })
export class BrokerAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'broker_connection_id', type: 'uuid', unique: true })
  @Index()
  brokerConnectionId: string;

  /** Decimal string — never float. */
  @Column({ name: 'balance', type: 'numeric', precision: 18, scale: 8, default: '0' })
  balance: string;

  /** Decimal string — never float. */
  @Column({ name: 'equity', type: 'numeric', precision: 18, scale: 8, default: '0' })
  equity: string;

  /** Decimal string — never float. */
  @Column({ name: 'margin', type: 'numeric', precision: 18, scale: 8, default: '0' })
  margin: string;

  /** Decimal string — never float. */
  @Column({ name: 'free_margin', type: 'numeric', precision: 18, scale: 8, default: '0' })
  freeMargin: string;

  /** Decimal string — percentage (e.g., '250.00' for 250%). */
  @Column({ name: 'margin_level', type: 'numeric', precision: 10, scale: 4, default: '0' })
  marginLevel: string;

  @Column({ name: 'currency', type: 'varchar', length: 3, nullable: true })
  currency: string | null;

  @Column({ name: 'leverage', type: 'integer', nullable: true })
  leverage: number | null;

  @Column({ name: 'open_positions_count', type: 'integer', default: 0 })
  openPositionsCount: number;

  @Column({ name: 'synced_at', type: 'timestamptz', nullable: true })
  syncedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => BrokerConnection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'broker_connection_id' })
  connection: BrokerConnection;
}
