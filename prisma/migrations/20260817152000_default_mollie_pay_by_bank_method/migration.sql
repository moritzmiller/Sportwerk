ALTER TABLE "Event"
    ALTER COLUMN "allowedPaymentMethods"
    SET DEFAULT ARRAY[
        'STRIPE'::"PaymentMethod",
        'MOLLIE_PAY_BY_BANK'::"PaymentMethod",
        'PAYPAL'::"PaymentMethod",
        'INVOICE'::"PaymentMethod",
        'BANK_TRANSFER'::"PaymentMethod"
    ];
