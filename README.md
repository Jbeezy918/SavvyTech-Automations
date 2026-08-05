# SavvyTech Automations

Modern customer-facing website for SavvyTech Consulting LLC, focused on:

- AI Receptionist
- AI Sales Agent
- Workflow Automation
- Custom Apps and Dashboards
- SOPsync

## Modernization branch

The `savvytech-modernization` branch contains the new Vinext/Next.js site and is intentionally separate from the current live website. It is deployed first as a private review checkpoint. The production domain must not be attached until the preview is approved.

## Local development

Requirements: Node.js 22.13 or newer and npm.

```bash
npm ci
npm run dev
```

Quality checks:

```bash
npm run lint
npm run build
```

## Launch prerequisites

- Approve final public pricing and service limits
- Select a booking calendar or CRM/form destination
- Confirm business phone, mailing address, and legal copy
- Add analytics and conversion tracking identifiers
- Approve the final production deployment and domain cutover

Never add secrets to the repository. Store deployment and integration credentials in the hosting platform's encrypted environment settings.
