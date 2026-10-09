// Shapes returned by the OneRoot API. Prisma Decimal fields arrive as strings — wrap with n() before math.

export type Dec = string | number;
export type Role = "ADMIN" | "MANAGER" | "CASHIER" | "ACCOUNTANT";
export type ProductType = "SEED" | "FERTILIZER" | "PESTICIDE" | "EQUIPMENT" | "OTHER";
export type PaymentMode = "CASH" | "UPI" | "CARD" | "BANK" | "CHEQUE" | "CREDIT";
export type PaymentStatus = "PAID" | "PARTIAL" | "UNPAID";
export type DocStatus = "COMPLETED" | "CANCELLED";
export type PoStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "SENT_BACK"
  | "APPROVED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "REJECTED"
  | "CANCELLED";
export type DebitNoteStatus = "DRAFT" | "SENT" | "CANCELLED";
export type NotificationType = "INFO" | "SUCCESS" | "WARNING" | "DANGER";
export type MovementType =
  | "OPENING"
  | "PURCHASE"
  | "PURCHASE_RETURN"
  | "SALE"
  | "SALE_RETURN"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "EXPIRED"
  | "DAMAGED"
  | "TRANSFER_IN"
  | "TRANSFER_OUT";

/** Compact branch reference embedded in documents */
export interface BranchRef {
  id: string;
  code: string;
  name: string;
}

/** A store location with its own stock — GET /branches adds headline numbers */
export interface Branch extends BranchRef {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  gstin?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  /** Batches holding stock */
  batches?: number;
  /** Stock value at cost */
  stockValue?: number;
  /** Active staff whose home branch this is */
  users?: number;
}

export interface StockTransferItem {
  id: string;
  productId: string;
  fromBatchId: string;
  toBatchId: string;
  batchNo?: string | null;
  expiryDate?: string | null;
  quantity: Dec;
  unitCost: Dec;
  product?: { name: string; unit: string };
}

export interface StockTransfer {
  id: string;
  transferNo: string;
  fromBranchId: string;
  toBranchId: string;
  transferDate: string;
  notes?: string | null;
  createdAt: string;
  fromBranch: BranchRef;
  toBranch: BranchRef;
  items: StockTransferItem[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  totalAmount?: Dec;
  paidAmount?: Dec;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: Role;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  /** Home branch; null = works across all branches */
  branchId?: string | null;
  branch?: BranchRef | null;
}

export interface StoreSettings {
  id: number;
  storeName: string;
  ownerName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  stateCode?: string | null;
  pincode?: string | null;
  gstin?: string | null;
  fertilizerLicenseNo?: string | null;
  pesticideLicenseNo?: string | null;
  seedLicenseNo?: string | null;
  invoicePrefix: string;
  purchasePrefix: string;
  poPrefix: string;
  receiptPrefix: string;
  invoiceFooter?: string | null;
  expiryAlertDays: number;
}

export interface Category {
  id: string;
  name: string;
  /** SKU prefix, e.g. FRT */
  code?: string | null;
  description?: string | null;
  _count?: { products: number };
}

export interface Batch {
  id: string;
  productId: string;
  batchNo: string;
  mfgDate?: string | null;
  expiryDate?: string | null;
  costPrice: Dec;
  mrp?: Dec | null;
  quantity: Dec;
  createdAt: string;
  branchId?: string;
  branch?: BranchRef | null;
  product?: Pick<Product, "id" | "name" | "sku" | "unit" | "type">;
}

export interface Product {
  id: string;
  sku: string;
  barcode?: string | null;
  name: string;
  type: ProductType;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
  brand?: string | null;
  manufacturer?: string | null;
  technicalName?: string | null;
  description?: string | null;
  hsnCode?: string | null;
  gstRate: Dec;
  unit: string;
  packSize?: string | null;
  mrp: Dec;
  salePrice: Dec;
  purchasePrice: Dec;
  reorderLevel: Dec;
  trackBatch: boolean;
  isActive: boolean;
  /** With a branch selected: stock in that branch; otherwise all branches */
  stock: Dec;
  /** Stock across all branches (sent when a branch is selected) */
  totalStock?: Dec;
  /** Detail only: stock per active branch */
  branchStock?: { branchId: string; code: string; name: string; quantity: number }[];
  batches?: Batch[];
}

export interface StockMovement {
  id: string;
  productId: string;
  type: MovementType;
  quantity: Dec;
  balanceAfter: Dec;
  unitCost?: Dec | null;
  refType?: string | null;
  refId?: string | null;
  refNo?: string | null;
  note?: string | null;
  createdAt: string;
  product?: { name: string; sku: string; unit: string };
  batch?: { batchNo: string; expiryDate?: string | null } | null;
  branch?: { code: string; name: string } | null;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  village?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  landAcres?: Dec | null;
  crops?: string | null;
  creditLimit: Dec;
  openingBalance: Dec;
  balance: Dec;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Vendor {
  id: string;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  ifsc?: string | null;
  paymentTermsDays: number;
  openingBalance: Dec;
  balance: Dec;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Payment {
  id: string;
  paymentNo: string;
  direction: "IN" | "OUT";
  partyType: "CUSTOMER" | "VENDOR";
  customerId?: string | null;
  vendorId?: string | null;
  saleId?: string | null;
  purchaseId?: string | null;
  amount: Dec;
  mode: PaymentMode;
  reference?: string | null;
  paymentDate: string;
  notes?: string | null;
  customer?: { id: string; name: string } | null;
  vendor?: { id: string; name: string } | null;
  sale?: { id: string; invoiceNo: string; customerName?: string | null } | null;
  purchase?: { id: string; purchaseNo: string } | null;
}

export interface SaleItem {
  id: string;
  productId: string;
  batchId?: string | null;
  batchNo?: string | null;
  expiryDate?: string | null;
  productName: string;
  hsnCode?: string | null;
  unit: string;
  quantity: Dec;
  rate: Dec;
  discountPct: Dec;
  gstRate: Dec;
  taxableAmount: Dec;
  taxAmount: Dec;
  amount: Dec;
  costPrice: Dec;
  returnedQty: Dec;
  product?: { sku: string; technicalName?: string | null; packSize?: string | null };
}

export interface SaleReturn {
  id: string;
  returnNo: string;
  saleId: string;
  returnDate: string;
  totalAmount: Dec;
  refundMode: PaymentMode;
  reason?: string | null;
  items: { id: string; saleItemId: string; productId: string; quantity: Dec; amount: Dec; product?: { name: string; unit: string } }[];
  sale?: { invoiceNo: string; customerName?: string | null };
  customer?: { name: string } | null;
}

export interface Sale {
  id: string;
  invoiceNo: string;
  customerId?: string | null;
  customer?: Customer | null;
  customerName?: string | null;
  customerPhone?: string | null;
  saleDate: string;
  dueDate?: string | null;
  subtotal: Dec;
  discount: Dec;
  taxAmount: Dec;
  cgst: Dec;
  sgst: Dec;
  igst: Dec;
  roundOff: Dec;
  totalAmount: Dec;
  paidAmount: Dec;
  costAmount: Dec;
  paymentMode: PaymentMode;
  paymentStatus: PaymentStatus;
  status: DocStatus;
  isInterState: boolean;
  notes?: string | null;
  items?: SaleItem[];
  payments?: Payment[];
  returns?: SaleReturn[];
  user?: { name: string } | null;
  _count?: { items: number };
}

export interface PurchaseItem {
  id: string;
  productId: string;
  batchId?: string | null;
  batchNo?: string | null;
  mfgDate?: string | null;
  expiryDate?: string | null;
  quantity: Dec;
  freeQty: Dec;
  rate: Dec;
  mrp?: Dec | null;
  discountPct: Dec;
  gstRate: Dec;
  taxableAmount: Dec;
  taxAmount: Dec;
  amount: Dec;
  product?: { name: string; sku: string; unit: string; hsnCode?: string | null };
}

export interface Purchase {
  id: string;
  purchaseNo: string;
  vendorId: string;
  vendor?: Vendor;
  poId?: string | null;
  po?: { id: string; poNo: string } | null;
  grnId?: string | null;
  grn?: { id: string; grnNo: string } | null;
  rateMismatch?: boolean;
  vendorInvoiceNo?: string | null;
  purchaseDate: string;
  dueDate?: string | null;
  subtotal: Dec;
  discount: Dec;
  taxAmount: Dec;
  otherCharges: Dec;
  roundOff: Dec;
  totalAmount: Dec;
  paidAmount: Dec;
  paymentStatus: PaymentStatus;
  status: DocStatus;
  notes?: string | null;
  items?: PurchaseItem[];
  payments?: Payment[];
  /** detail only: debit/credit notes against this invoice */
  debitNotes?: NoteSummary[];
  user?: { name: string } | null;
  _count?: { items: number };
}

/** One step of a PO's approval chain, with its state for this PO */
export interface ChainStep {
  order: number;
  title: string;
  approverId: string | null;
  approverName: string | null;
  state: "done" | "current" | "pending" | "rejected";
}

export interface PoItem {
  id: string;
  productId: string;
  quantity: Dec;
  rate: Dec; // excl. GST
  gstRate: Dec;
  amount: Dec; // incl. GST
  passedQty: Dec;
  rejectedQty: Dec;
  damagedQty: Dec;
  expiredQty: Dec;
  pendingQty?: number;
  product: { name: string; sku: string; unit: string; hsnCode?: string | null; trackBatch: boolean; packSize?: string | null };
}

export interface PoHistory {
  id: string;
  round: number;
  action: string;
  userName: string;
  note?: string | null;
  at: string;
}

export interface PurchaseOrder {
  id: string;
  poNo: string;
  vendorId: string;
  vendor?: Vendor;
  orderDate: string;
  expectedDate?: string | null;
  status: PoStatus;
  subtotal: Dec;
  taxAmount: Dec;
  totalAmount: Dec;
  round: number;
  level: number;
  levelsNeeded: number;
  notes?: string | null;
  createdBy?: { id?: string; name: string } | null;
  chain: ChainStep[];
  receivedPct: number;
  canEdit: boolean;
  /** Branch the goods are delivered to */
  branchId?: string | null;
  branch?: (BranchRef & { address?: string | null; city?: string | null }) | null;
  // list only
  itemCount?: number;
  // detail only
  items?: PoItem[];
  history?: PoHistory[];
  waitingFor?: ChainStep | null;
  canAct?: boolean;
  grns?: { id: string; grnNo: string; receivedAt: string; receivedBy?: { name: string } | null }[];
  purchases?: { id: string; purchaseNo: string; status: DocStatus }[];
  debitNotes?: NoteSummary[];
}

export interface ApprovalQueue {
  pending: (PurchaseOrder & {
    lastAction: PoHistory | null;
    waitingFor: ChainStep;
    canAct: boolean;
    createdBy?: { name: string } | null;
    _count: { items: number };
  })[];
  mine: number;
  reapprovals: number;
  byStep: { title: string; approverName: string | null; waiting: number }[];
  decisions: (PoHistory & { po: { id: string; poNo: string } })[];
}

export interface ApprovalConfig {
  steps: { id: string; order: number; title: string; approverId: string | null; approver?: { id: string; name: string; role: Role } | null }[];
  bands: { id: string; upTo: number | null; steps: number }[];
}

export interface PendingInwardPo {
  id: string;
  poNo: string;
  vendor: { id: string; name: string };
  orderDate: string;
  expectedDate?: string | null;
  status: PoStatus;
  totalAmount: Dec;
  products: string[];
  receivedPct: number;
  late: boolean;
  branchId?: string | null;
  branch?: BranchRef | null;
}

export interface GrnItem {
  id: string;
  poItemId: string;
  productId: string;
  passedQty: Dec;
  rejectedQty: Dec;
  damagedQty: Dec;
  expiredQty: Dec;
  batchNo?: string | null;
  mfgDate?: string | null;
  expiryDate?: string | null;
  batchId?: string | null;
  rate: Dec; // PO rate excl. GST
  product: { name: string; sku: string; unit: string; hsnCode?: string | null };
  poItem: { rate: Dec; gstRate: Dec; quantity: Dec };
}

export interface Grn {
  id: string;
  grnNo: string;
  po: { id: string; poNo: string; vendorId?: string };
  vendor: Vendor | { id: string; name: string };
  receivedAt: string;
  receivedBy?: { name: string } | null;
  /** Branch the goods were received into */
  branchId?: string | null;
  vehicleNo?: string | null;
  notes?: string | null;
  purchase?: { id: string; purchaseNo: string; status?: DocStatus } | null;
  // list only: totals per GRN
  passed?: number;
  rejected?: number;
  damaged?: number;
  expired?: number;
  // detail only
  items?: GrnItem[];
  debitNotes?: { id: string; dnNo: string; status: DebitNoteStatus }[];
}

export type NoteType = "DEBIT" | "CREDIT";
export type NoteReason =
  | "RETURN"
  | "REJECTED_AT_INWARD"
  | "RATE_DIFFERENCE"
  | "SHORT_SUPPLY"
  | "DAMAGED_IN_TRANSIT"
  | "SCHEME_INCENTIVE"
  | "PRICE_PROTECTION"
  | "CASH_DISCOUNT"
  | "AGAINST_DEBIT_NOTE"
  | "OTHER";

export const NOTE_REASON_LABEL: Record<NoteReason, string> = {
  RETURN: "Goods returned",
  REJECTED_AT_INWARD: "Rejected at inward",
  RATE_DIFFERENCE: "Rate difference",
  SHORT_SUPPLY: "Short supply",
  DAMAGED_IN_TRANSIT: "Damaged in transit",
  SCHEME_INCENTIVE: "Scheme / target incentive",
  PRICE_PROTECTION: "Price protection",
  CASH_DISCOUNT: "Cash discount",
  AGAINST_DEBIT_NOTE: "Against our debit note",
  OTHER: "Other",
};

/** Debit (we raise) or credit (vendor gives us) note — the list/detail shape from GET /debit-notes */
export interface DebitNote {
  id: string;
  dnNo: string;
  noteType: NoteType;
  reasonType: NoteReason;
  vendorId: string;
  vendor: { id: string; name: string; gstin?: string | null; state?: string | null; address?: string | null; city?: string | null };
  grn?: { id: string; grnNo: string } | null;
  purchaseId?: string | null;
  purchase?: { id: string; purchaseNo: string; vendorInvoiceNo?: string | null } | null;
  poId?: string | null;
  po?: { id: string; poNo: string } | null;
  /** The vendor's own note number (credit notes) */
  vendorRef?: string | null;
  noteDate: string;
  reason: string;
  status: DebitNoteStatus;
  /** Goods return: stock leaves when posted */
  affectsStock: boolean;
  /** Money-only note: the payable drops when posted */
  affectsBalance: boolean;
  subtotal: Dec;
  taxAmount: Dec;
  totalAmount: Dec;
  items: {
    id: string;
    productId?: string | null;
    description?: string | null;
    batchId?: string | null;
    batchNo?: string | null;
    quantity: Dec;
    rate: Dec;
    gstRate: Dec;
    amount: Dec;
    product: { name: string; unit: string; hsnCode?: string | null } | null;
  }[];
}

/** Compact note row embedded in PO / purchase invoice details */
export interface NoteSummary {
  id: string;
  dnNo: string;
  noteType: NoteType;
  reasonType: NoteReason;
  reason: string;
  status: DebitNoteStatus;
  totalAmount: Dec;
  noteDate: string;
  vendorRef?: string | null;
  purchase?: { id: string; purchaseNo: string } | null;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string | null;
  module: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
}

export interface Expense {
  id: string;
  categoryId: string;
  category: ExpenseCategory;
  amount: Dec;
  expenseDate: string;
  mode: PaymentMode;
  paidTo?: string | null;
  reference?: string | null;
  notes?: string | null;
  user?: { name: string } | null;
}

export interface LedgerEntry {
  date: string;
  type: string;
  refNo: string;
  refId?: string;
  debit: number;
  credit: number;
  balance: number;
  note?: string | null;
}

export interface Ledger<P> {
  party: P;
  openingBalance: number;
  entries: LedgerEntry[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: unknown;
  createdAt: string;
  user?: { name: string; email: string } | null;
}

export const PRODUCT_TYPES: ProductType[] = ["SEED", "FERTILIZER", "PESTICIDE", "EQUIPMENT", "OTHER"];
export const PAYMENT_MODES: PaymentMode[] = ["CASH", "UPI", "CARD", "BANK", "CHEQUE", "CREDIT"];
export const UNITS = ["NOS", "KG", "GM", "LTR", "ML", "BAG", "PKT", "BOX", "BTL", "MTR"];
export const GST_RATES = [0, 5, 12, 18, 28];
export const ROLES: Role[] = ["ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"];

export const TYPE_LABEL: Record<ProductType, string> = {
  SEED: "Seed",
  FERTILIZER: "Fertilizer",
  PESTICIDE: "Pesticide",
  EQUIPMENT: "Equipment",
  OTHER: "Other",
};
