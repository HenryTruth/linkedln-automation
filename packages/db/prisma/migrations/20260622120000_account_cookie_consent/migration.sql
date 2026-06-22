-- Track explicit consent before storing LinkedIn session cookies.
ALTER TABLE "Account" ADD COLUMN "cookiesConsentAt" TIMESTAMP(3);
