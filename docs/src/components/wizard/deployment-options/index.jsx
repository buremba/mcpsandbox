import GTMDeployment from './GTMDeployment';
import CloudflareDeployment from './CloudflareDeployment';
import EmailDeployment from './EmailDeployment';

export const DEPLOYMENT_OPTIONS = [
  {
    id: 'gtm',
    title: 'Google Tag Manager',
    description: 'Deploy via GTM custom HTML tag',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#4285F4"/>
        <path d="M2 17l10 5 10-5" stroke="#4285F4" strokeWidth="2"/>
        <path d="M2 12l10 5 10-5" stroke="#34A853" strokeWidth="2"/>
      </svg>
    ),
    component: GTMDeployment,
  },
  {
    id: 'cloudflare',
    title: 'Cloudflare Snippets',
    description: 'Add via Cloudflare dashboard',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="#F38020">
        <path d="M16.5 12.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5h9zm-9 4c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5h9c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5h-9zm0-8c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5h9c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5h-9z"/>
      </svg>
    ),
    component: CloudflareDeployment,
  },
  {
    id: 'email',
    title: 'Email to Teammate',
    description: 'Send instructions via email',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--accent-blue)">
        <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
      </svg>
    ),
    component: EmailDeployment,
  },
];

export { default as DeploymentOption } from './DeploymentOption';
export { default as GTMDeployment } from './GTMDeployment';
export { default as CloudflareDeployment } from './CloudflareDeployment';
export { default as EmailDeployment } from './EmailDeployment';
