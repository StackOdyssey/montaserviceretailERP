ALTER TABLE "business_line_document_settings" DROP CONSTRAINT "business_line_document_settings_fac_av_show_vat";--> statement-breakpoint
ALTER TABLE "sales_documents" DROP CONSTRAINT "sales_documents_fac_av_show_vat";--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "vat_liable" boolean DEFAULT true NOT NULL;