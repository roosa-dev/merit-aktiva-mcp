import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { sign, timestampUtc } from "./sign.js";

export async function callMerit(path: string, body: unknown): Promise<string> {
  const apiId = process.env.MERIT_API_ID ?? "";
  const apiKey = process.env.MERIT_API_KEY ?? "";
  const base = process.env.MERIT_BASE_URL ?? "https://aktiva.merit.ee";
  const rawBody = JSON.stringify(body ?? {});
  const timestamp = timestampUtc();
  const signature = sign(apiId, apiKey, timestamp, rawBody);
  const url = `${base}${path}?apiId=${encodeURIComponent(apiId)}&timestamp=${timestamp}&signature=${encodeURIComponent(signature)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody,
  });
  // ponytail: Merit returns errors as plain text at times — pass text through untouched
  const text = await res.text();
  if (!res.ok) throw new Error(`Merit API ${res.status}: ${text}`);
  return text;
}

// Docs: https://api.merit.ee/connecting-robots/reference-manual/
// Dates are strings "yyyymmdd" unless noted. List endpoints cap periods at 3 months.
export const ENDPOINTS: { name: string; path: string; desc: string }[] = [
  // Sales invoices
  { name: "get_invoices", path: "/api/v2/getinvoices", desc: "List sales invoices. Body: PeriodStart, PeriodEnd (yyyymmdd, max 3 months apart), optional UnPaid (bool), DateType (0=doc date, 1=changed date), BankId." },
  { name: "get_invoices_by_no_or_customer", path: "/api/v2/getinvoices2", desc: "List sales invoices filtered by invoice number or customer. Body: InvoiceNo and/or Customer name filters." },
  { name: "get_invoice", path: "/api/v2/getinvoice", desc: "Get one sales invoice with rows and payments. Body: Id (GUID), optional AddAttachment (bool)." },
  { name: "create_invoice", path: "/api/v2/sendinvoice", desc: "Create a sales invoice (use negative Quantity/TotalAmount for credit invoice; invoices cannot be updated — delete and recreate). Body: Customer {Name, RegNo, CountryCode, ...}, InvoiceNo, DocDate, DueDate, InvoiceRow[] {Item {Code, Description, Type, UOMName}, Quantity, Price, TaxId}, TaxAmount[] {TaxId, Amount}, TotalAmount." },
  { name: "delete_invoice", path: "/api/v1/deleteinvoice", desc: "DESTRUCTIVE: delete a sales invoice. Body: Id (GUID)." },
  { name: "get_invoice_pdf", path: "/api/v2/getsalesinvpdf", desc: "Get sales invoice PDF as base64 (FileName + FileContent). Body: Id (GUID), optional DelivNote (bool)." },
  { name: "email_invoice", path: "/api/v2/sendinvoicebyemail", desc: "Email a sales invoice to the customer. Body: Id (GUID of invoice, SIHId), optional DelivNote (bool)." },
  // Purchase invoices
  { name: "get_purchase_invoices", path: "/api/v2/getpurchorders", desc: "List purchase invoices. Body: PeriodStart, PeriodEnd (yyyymmdd, max 3 months), optional UnPaid (bool), DateType (0=doc date, 1=changed)." },
  { name: "get_purchase_invoice", path: "/api/v2/getpurchorder", desc: "Get one purchase invoice with rows and payments. Body: Id (GUID), optional SkipAttachment." },
  { name: "create_purchase_invoice", path: "/api/v2/sendpurchinvoice", desc: "Create a purchase invoice (creates document + GL entry, bypasses approval flow). Body: Vendor {Name, RegNo, CountryCode, ...}, BillNo, DocDate, DueDate, InvoiceRow[], TaxAmount[], TotalAmount." },
  { name: "delete_purchase_invoice", path: "/api/v1/deletepurchinvoice", desc: "DESTRUCTIVE: delete a purchase invoice. Body: Id (GUID)." },
  // Payments
  { name: "get_payments", path: "/api/v2/getpayments", desc: "List payments. Body: PeriodStart, PeriodEnd (yyyymmdd, max 3 months), optional PaymentType (int), BankId (GUID), DateType." },
  { name: "get_payment_types", path: "/api/v2/getpaymenttypes", desc: "List payment types. Body: Type (int: 1=purchases, 2=expense reports, 3=sales)." },
  { name: "create_sales_payment", path: "/api/v2/sendpayment", desc: "Record a payment against a sales invoice. Body: CustomerName, InvoiceNo, PaymentDate, Amount, BankId or IBAN; optional CurrencyCode." },
  { name: "create_purchase_payment", path: "/api/v2/sendPaymentV", desc: "Record a payment for a purchase invoice. Body: VendorName, BillNo, PaymentDate (YYYYmmddHHii), Amount, BankId or IBAN; optional CurrencyCode." },
  { name: "delete_payment", path: "/api/v1/deletepayment", desc: "DESTRUCTIVE: delete a payment. Body: Id (GUID)." },
  // Customers
  { name: "get_customers", path: "/api/v1/getcustomers", desc: "List/search customers. Body filters (empty = all, can be large): Id (GUID), RegNo, VatRegNo (exact), Name (partial), ChangedDate (yyyymmdd), WithComments, CommentsFrom." },
  { name: "create_customer", path: "/api/v2/sendcustomer", desc: "Create a customer. Body: Name (unique, max 150), NotTDCustomer (bool), CountryCode (2 chars); optional RegNo, VatRegNo, Email, Address, PaymentDeadLine, ..." },
  { name: "update_customer", path: "/api/v1/updatecustomer", desc: "Update a customer. Body: Id (GUID) + fields to change." },
  { name: "get_customer_groups", path: "/api/v2/getcustomergroups", desc: "List customer groups. Body: {} (empty)." },
  { name: "create_customer_group", path: "/api/v2/sendcustomergroup", desc: "Create a customer group. Body: Id (GUID), Name (max 64), Code (max 20)." },
  // Vendors
  { name: "get_vendors", path: "/api/v1/getvendors", desc: "List/search vendors. Body filters: Id (GUID), RegNo, VatRegNo, Name, ChangedDate (yyyymmdd)." },
  { name: "create_vendor", path: "/api/v2/sendvendor", desc: "Create a vendor. Body: Name (unique, max 150), VatAccountable (bool), CountryCode (2 chars)." },
  { name: "update_vendor", path: "/api/v2/updatevendor", desc: "Update a vendor (v2 supports Dimensions). Body: Id (GUID) + fields to change." },
  { name: "get_vendor_groups", path: "/api/v2/getvendorgroups", desc: "List vendor groups. Body: {} (empty)." },
  { name: "create_vendor_group", path: "/api/v2/sendvendorgroup", desc: "Create a vendor group. Body: Id (GUID), Name (max 64), Code (max 20)." },
  // Items
  { name: "get_items", path: "/api/v1/getitems", desc: "List/search items. Body filters: Id, Code, Description; optional LocationCode, Usage, Type." },
  { name: "create_items", path: "/api/v2/senditems", desc: "Create items. Body: Items[] {Type (1=stock, 2=service, 3=item), Usage (1=sales, 2=purchases, 3=both), Code (max 20), Description (max 100), UOMName}." },
  { name: "update_item", path: "/api/v1/updateitem", desc: "Update an item. Body: Id (GUID) + fields to change." },
  { name: "get_item_groups", path: "/api/v2/getitemgroups", desc: "List item groups. Body: {} (empty)." },
  { name: "create_item_groups", path: "/api/v2/senditemgroups", desc: "Create item groups. Body: ItemGroups[] {Code, Name}." },
  // Reference data
  { name: "get_accounts", path: "/api/v1/getaccounts", desc: "Chart of accounts. Body: {} or UsageFilter (1=cost, 2=contra, 3=purchase VAT)." },
  { name: "get_taxes", path: "/api/v1/gettaxes", desc: "List tax rates (TaxId values used on invoice rows). Body: {} (empty)." },
  { name: "create_tax", path: "/api/v2/sendtax", desc: "Create a tax (e.g. OSS). Body: TaxType (int, e.g. 12=OSS EU sale), CountryCode." },
  { name: "get_dimensions", path: "/api/v2/getdimensions", desc: "List dimensions and their values. Body: AllValues (bool)." },
  { name: "create_dimensions", path: "/api/v2/senddimensions", desc: "Create dimensions. Body: Dimensions[] {Id, Name (max 50), Type (1=detail, 2=summary)}." },
  { name: "create_dimension_values", path: "/api/v2/senddimvalues", desc: "Create or end-date dimension values. Body: Dimensions[] {DimId, DimValueCode, DimValueName, EndDate}." },
  { name: "get_departments", path: "/api/v1/getdepartments", desc: "List departments. Body: {} (empty)." },
  { name: "get_projects", path: "/api/v1/getprojects", desc: "List projects (Code, Name, EndDate). Body: {} (empty)." },
  { name: "get_cost_centers", path: "/api/v1/getcostcenters", desc: "List cost centers. Body: {} (empty)." },
  { name: "get_units", path: "/api/v1/getunits", desc: "List units of measure. Body: {} (empty)." },
  { name: "create_unit", path: "/api/v2/senduom", desc: "Create a unit of measure. Body: Name, NamePlural (+ optional localized names)." },
  { name: "get_banks", path: "/api/v1/getbanks", desc: "List banks. Body: {} (empty)." },
  { name: "get_financial_years", path: "/api/v2/getaccperiods", desc: "List accounting periods / financial years. Body: {} (empty)." },
  // General ledger
  { name: "create_gl_batch", path: "/api/v1/sendglbatch", desc: "Create a general ledger transaction batch. Body: DocNo (max 35), BatchDate, EntryRow[] {AccountCode, Debit, Credit, Description}." },
  { name: "get_gl_batches", path: "/api/v1/getglbatches", desc: "List GL batches. Body: PeriodStart, PeriodEnd (yyyymmdd, max 3 months), DateType." },
  { name: "get_gl_batch", path: "/api/v1/getglbatch", desc: "Get one GL batch with entries. Body: Id (GUID), optional AddAttachment (bool)." },
  { name: "get_gl_batches_full", path: "/api/v1/GetGLBatchesFull", desc: "GL batches with entries and cost allocations in one call. Body: PeriodStart, PeriodEnd (max 31 days), WithLines (0/1), WithCostAlloc (0/1), DateType." },
  // Sales offers
  { name: "get_offers", path: "/api/v2/getoffers", desc: "List sales offers/quotes/orders/prepayment invoices. Body: PeriodStart, PeriodEnd (yyyymmdd, max 3 months), optional DateType, UnPaid." },
  { name: "get_offer", path: "/api/v2/getoffer", desc: "Get one offer with rows. Body: Id (GUID)." },
  { name: "create_offer", path: "/api/v2/sendoffer", desc: "Create a sales offer/quote/order. Body: OfferNo, Customer object, OfferRow[], TaxAmount[]." },
  { name: "update_offer", path: "/api/v2/updateoffer", desc: "Update an existing offer. Body: OfferNo, DeliveryDate, HComment, FComment." },
  { name: "set_offer_status", path: "/api/v2/setofferstatus", desc: "Change offer status. Body: Id (GUID), NewStatus (int 1-5, 7), Comment (required for status 5)." },
  { name: "offer_to_invoice", path: "/api/v2/offer2inv", desc: "Convert an offer into a sales invoice. Body: Id (GUID of offer)." },
  // Reports
  { name: "get_customer_debts_report", path: "/api/v1/getcustdebtrep", desc: "Customer debts report. Body: CustName or CustId (GUID), OverDueDays (int), optional DebtDate (yyyymmdd)." },
  { name: "get_customer_payments_report", path: "/api/v2/getcustpaymrep", desc: "Customer payments report (paginated: response HasMore/Id4More, continue with get_more_data). Body: CustName or CustId, PeriodStart, PeriodEnd, CurrncyCode." },
  { name: "get_profit_report", path: "/api/v1/getprofitrep", desc: "Income statement (profit & loss). Body: EndDate (yyyymmdd), PerCount (months back), optional DepFilter." },
  { name: "get_balance_report", path: "/api/v1/getbalancerep", desc: "Balance sheet. Body: EndDate (yyyymmdd), PerCount (months)." },
  { name: "get_inventory_report", path: "/api/v2/getinventoryreport", desc: "Inventory report. Body: RepDate (yyyymmdd), optional Location, ArticleGroups[], ShowZero, WithReservations." },
  { name: "get_sales_report", path: "/api/v2/getsalesrep", desc: "Sales report. Body: StartDate, EndDate, ReportType (1-5: grouping)." },
  { name: "get_purchase_report", path: "/api/v2/getpurchrep", desc: "Purchase report. Body: StartDate, EndDate, ReportType (1=invoices, 2=vendors, 3=articles, 4=fixed assets)." },
  { name: "get_more_data", path: "/api/v2/getmoredata", desc: "Continuation for paginated report responses. Body: Id (the Id4More value from a previous response with HasMore=true)." },
];

export function createServer(): Server {
  const server = new Server(
    { name: "merit-aktiva", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ENDPOINTS.map((e) => ({
      name: e.name,
      description: e.desc,
      inputSchema: {
        type: "object" as const,
        additionalProperties: true,
        description: "Merit API request body; see tool description for fields. Empty object if none required.",
      },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const endpoint = ENDPOINTS.find((e) => e.name === req.params.name);
    if (!endpoint) {
      return { content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }], isError: true };
    }
    try {
      const text = await callMerit(endpoint.path, req.params.arguments ?? {});
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: String(err) }], isError: true };
    }
  });
  return server;
}
