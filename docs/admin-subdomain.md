# Admin subdomain

The application recognizes these hosts:

- Production: `admin.insightgraphy.org`
- Local development: `admin.localhost`

Routes on the admin host are mapped as follows:

| Browser URL | Internal route |
| --- | --- |
| `/` | `/admin` |
| `/hub` | `/admin/hub` |
| `/access` | `/admin/hub/access` |
| `/members` | `/admin/hub/members` |
| `/semesters` | `/admin/hub/semesters` |

## Deployment

1. Add `admin.insightgraphy.org` to the same hosting project as `insightgraphy.org`.
2. Add the CNAME record requested by the hosting provider.
3. Deploy the application containing `proxy.ts`.
4. Open `https://admin.insightgraphy.org` and sign in separately on the admin origin.

For Vercel, add the subdomain under Project Settings > Domains. If DNS is not managed by Vercel, add the exact CNAME target shown by Vercel at the external DNS provider.

The password login flow does not need an OAuth callback URL. If OAuth or magic-link login is added later, register the admin subdomain callback in Supabase Auth URL Configuration.
