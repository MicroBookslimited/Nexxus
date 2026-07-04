// Standard Terms & Conditions for NEXXUS POS.
//
// IMPORTANT: `TERMS_VERSION` is the source of truth the client displays. The
// server records its OWN authoritative version at acceptance time (see the
// TERMS_VERSION constants in the api-server register routes). If you change the
// substance of these terms, bump BOTH this version and the server versions in
// lockstep so recorded consent stays meaningful.

export const TERMS_VERSION = "1.0";
export const TERMS_EFFECTIVE_DATE = "July 3, 2026";

export interface TermsSection {
  heading: string;
  body: string[];
}

export const TERMS_SECTIONS: TermsSection[] = [
  {
    heading: "1. Agreement to Terms",
    body: [
      "These Terms & Conditions (the \"Terms\") govern your access to and use of the NEXXUS POS point-of-sale software, applications, and related services (collectively, the \"Service\"). By creating an account, registering, or otherwise using the Service, you agree to be bound by these Terms.",
      "If you are entering into these Terms on behalf of a business or other legal entity, you represent that you have the authority to bind that entity, in which case \"you\" refers to that entity.",
    ],
  },
  {
    heading: "2. The Service",
    body: [
      "NEXXUS POS provides cloud-based point-of-sale, inventory, accounting, staff management, and related business tools on a subscription basis. We may update, improve, or modify features of the Service from time to time.",
      "You are responsible for obtaining and maintaining the hardware, devices, and internet connectivity required to use the Service.",
    ],
  },
  {
    heading: "3. Accounts & Security",
    body: [
      "You must provide accurate, current, and complete information when creating an account and keep it up to date. You are responsible for safeguarding your login credentials and PINs, and for all activity that occurs under your account.",
      "You must notify us promptly of any unauthorized use of your account or any other breach of security. We are not liable for any loss arising from unauthorized use of your account.",
    ],
  },
  {
    heading: "4. Subscriptions, Trials & Billing",
    body: [
      "The Service is offered on a subscription basis. Free trials, where available, convert to a paid subscription unless cancelled before the trial ends. Subscription fees are billed in advance on a recurring basis according to the plan and billing cycle you select.",
      "All fees are non-refundable except where required by law. You authorize us and our payment processors to charge your selected payment method for all applicable fees. If a payment fails, we may suspend or terminate your access until amounts due are paid.",
      "We may change subscription pricing on prospective renewal terms with reasonable advance notice.",
    ],
  },
  {
    heading: "5. Acceptable Use",
    body: [
      "You agree to use the Service only for lawful business purposes and in compliance with all applicable laws and regulations, including tax, consumer-protection, and payment-card rules.",
      "You must not misuse the Service, including by attempting to gain unauthorized access, interfering with its operation, reverse-engineering it, reselling it without authorization, or using it to store or transmit unlawful, infringing, or harmful content.",
    ],
  },
  {
    heading: "6. Your Data",
    body: [
      "You retain ownership of the business, product, customer, and transaction data you enter into the Service (\"Your Data\"). You grant us a limited license to host, process, and transmit Your Data solely to provide and improve the Service.",
      "You are responsible for the accuracy and legality of Your Data and for obtaining any consents required to collect and process information about your own customers and staff. We handle Your Data in accordance with our Privacy Policy.",
    ],
  },
  {
    heading: "7. Payment Processing",
    body: [
      "Payment processing performed through the Service may be handled by third-party processors and is subject to their terms. We are not responsible for the acts or omissions of these third-party processors, and you are responsible for any chargebacks, disputes, or fees arising from your transactions.",
    ],
  },
  {
    heading: "8. Intellectual Property",
    body: [
      "The Service, including all software, designs, and trademarks, is owned by NEXXUS POS and its licensors and is protected by intellectual-property laws. Except for the limited right to use the Service under these Terms, no rights are granted to you.",
    ],
  },
  {
    heading: "9. Service Availability",
    body: [
      "We strive to keep the Service available but do not guarantee uninterrupted or error-free operation. The Service may be temporarily unavailable due to maintenance, updates, or factors beyond our control. You are responsible for maintaining your own backups and contingency procedures for critical operations.",
    ],
  },
  {
    heading: "10. Disclaimers",
    body: [
      "The Service is provided \"as is\" and \"as available\" without warranties of any kind, whether express or implied, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement, to the maximum extent permitted by law.",
    ],
  },
  {
    heading: "11. Limitation of Liability",
    body: [
      "To the maximum extent permitted by law, NEXXUS POS will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of profits, revenue, data, or goodwill. Our total aggregate liability arising out of or relating to the Service will not exceed the amount you paid us for the Service in the twelve (12) months preceding the event giving rise to the claim.",
    ],
  },
  {
    heading: "12. Termination",
    body: [
      "You may cancel your subscription at any time; access continues until the end of the current billing period. We may suspend or terminate your access if you breach these Terms, fail to pay, or use the Service unlawfully.",
      "Upon termination, your right to use the Service ends. We may delete Your Data after a reasonable retention period unless a longer period is required by law.",
    ],
  },
  {
    heading: "13. Changes to These Terms",
    body: [
      "We may update these Terms from time to time. Material changes will be communicated through the Service or by email, and, where required, we may ask you to accept the updated Terms. Your continued use of the Service after changes take effect constitutes acceptance of the revised Terms.",
    ],
  },
  {
    heading: "14. Contact",
    body: [
      "Questions about these Terms can be directed to your NEXXUS POS account representative or support channel.",
    ],
  },
];
