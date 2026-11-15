import React, { useEffect, useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, MoonIcon, SunIcon } from './Icons';
import { MCloudLogo } from './MCloudLogo';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import {
  ALL_GLOBAL_REGIONS,
  DEFAULT_REGION,
  GLOBAL_REGION_GROUPS,
  PREFERRED_REGION_STORAGE_KEY,
} from '../lib/regions';
import { HostingPlan } from '../types/mcloud';

export type PublicRoute =
  | 'home'
  | 'about'
  | 'cloud-hosting'
  | 'web-hosting'
  | 'vps-hosting'
  | 'dedicated-servers'
  | 'application-hosting'
  | 'pricing'
  | 'features'
  | 'docs'
  | 'support'
  | 'contact'
  | 'login'
  | 'register'
  | 'privacy';

interface PublicSiteProps {
  route: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
  onEnterConsole: (preselectPlanId?: number) => void;
}

const IMAGE_HERO = '/src/assets/images/hero_cloud_datacenter_1794698293276.jpg';
const IMAGE_NODE = '/src/assets/images/infrastructure_server_node_1794698293123.jpg';
const IMAGE_VAULT = '/src/assets/images/security_network_vault_1794698292952.jpg';

const ResilientImage: React.FC<{
  src: string;
  alt: string;
  className?: string;
}> = ({ src, alt, className = '' }) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 p-6 ${className}`}
      >
        <span className="text-xs font-medium text-center">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};

export const PublicSite: React.FC<PublicSiteProps> = ({
  route,
  onNavigate,
  onEnterConsole,
}) => {
  const {
    isAuthenticated,
    theme,
    toggleTheme,
    signInWithGoogle,
    registerWithPassword,
    loginWithPassword,
    authError,
  } = useAuth();
  const [plans, setPlans] = useState<HostingPlan[]>([]);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [zoneCount, setZoneCount] = useState<number>(ALL_GLOBAL_REGIONS.length);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [workbenchTab, setWorkbenchTab] = useState<'runtime' | 'dns' | 'database' | 'deploy'>(
    'runtime'
  );

  // Auth & Signup state
  const [authBusy, setAuthBusy] = useState(false);
  const [localAuthError, setLocalAuthError] = useState<string | null>(null);
  const [signupForm, setSignupForm] = useState({
    fullName: '',
    organizationName: '',
    email: '',
    password: '',
    region: DEFAULT_REGION,
    customRegion: '',
    activateSandbox: true,
    acceptedPrivacy: true,
  });
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
  });

  // Contact form state
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    company: '',
    topic: 'sales',
    message: '',
  });
  const [contactStatus, setContactStatus] = useState<{
    type: 'idle' | 'submitting' | 'success' | 'error';
    text?: string;
  }>({ type: 'idle' });

  useEffect(() => {
    fetch('/api/public/plans')
      .then((r) => r.json())
      .then((d) => setPlans(d.plans || []))
      .catch(() => {});

    fetch('/api/public/nodes-summary')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.totalZones === 'number') setZoneCount(d.totalZones);
      })
      .catch(() => {});
  }, []);

  const handleGoogleAuthAction = async () => {
    setAuthBusy(true);
    setLocalAuthError(null);
    try {
      await signInWithGoogle();
      onEnterConsole();
    } catch (err: any) {
      setLocalAuthError(err.message || 'Google sign in did not complete.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handlePasswordLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthBusy(true);
    setLocalAuthError(null);
    try {
      await loginWithPassword(loginForm.email.trim(), loginForm.password);
      onEnterConsole();
    } catch (err: any) {
      setLocalAuthError(err.message || 'Sign in failed. Check your email and password.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupForm.acceptedPrivacy) {
      setLocalAuthError('Please review and accept the Privacy Policy to continue.');
      return;
    }
    const effectiveRegion =
      signupForm.region === '__custom__'
        ? signupForm.customRegion.trim()
        : signupForm.region;
    if (effectiveRegion.length < 2) {
      setLocalAuthError('Please enter your city, country, or region.');
      return;
    }
    setAuthBusy(true);
    setLocalAuthError(null);
    try {
      await registerWithPassword({
        email: signupForm.email.trim(),
        password: signupForm.password,
        displayName: signupForm.fullName.trim(),
        organizationName: signupForm.organizationName.trim(),
      });
      try {
        localStorage.setItem(PREFERRED_REGION_STORAGE_KEY, effectiveRegion);
      } catch {
        // Ignore storage restrictions
      }
      const sandboxPlan = plans.find((p) => p.slug === 'developer-sandbox');
      onEnterConsole(signupForm.activateSandbox && sandboxPlan ? sandboxPlan.id : undefined);
    } catch (err: any) {
      setLocalAuthError(err.message || 'Account creation did not complete.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactStatus({ type: 'submitting' });
    try {
      const res = await fetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');
      setContactStatus({ type: 'success', text: data.message });
      setContactForm({ name: '', email: '', company: '', topic: 'sales', message: '' });
    } catch (err: any) {
      setContactStatus({ type: 'error', text: err.message });
    }
  };

  const faqs = [
    {
      q: 'How are customer workloads isolated inside MCloud?',
      a: 'Each subscription provisions an isolated hosting account with scoped filesystem paths, separate database user accounts, salted bcrypt credentials, and per-user session verification.',
    },
    {
      q: 'Can I test MCloud without entering live credit card details?',
      a: 'Yes. Select the $0 Developer Sandbox plan or run through Sandbox Checkout (Stripe, PayPal, and M-Pesa test modes) without storing raw card numbers.',
    },
    {
      q: 'Which runtimes and database engines are supported?',
      a: 'MCloud supports Static sites, Node.js, PHP, Python, and Docker applications alongside managed PostgreSQL, MySQL, and MariaDB databases.',
    },
    {
      q: 'How are passwords and access credentials protected?',
      a: 'Account passwords, database user passwords, SFTP secrets, and workspace API keys are hashed with salted bcrypt (cost factor 12) before storage. Raw credentials are never sent back to the browser.',
    },
  ];

  const hostingProductTabs: Array<{ route: PublicRoute; label: string }> = [
    { route: 'cloud-hosting', label: 'Cloud Hosting' },
    { route: 'web-hosting', label: 'Web Hosting' },
    { route: 'vps-hosting', label: 'VPS Hosting' },
    { route: 'dedicated-servers', label: 'Dedicated Servers' },
    { route: 'application-hosting', label: 'Application Hosting' },
  ];

  const renderPlanCards = (filterCategory?: HostingPlan['category'], showMatrix = true) => {
    const visible = filterCategory
      ? plans.filter((p) => p.category === filterCategory)
      : plans;

    return (
      <div className="space-y-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-blue-700 dark:text-sky-400">
              Pricing & Quotas
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 mt-1">
              From $0 Sandbox to Dedicated Bare Metal
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
              Explicit vCPU, RAM, storage, and quota limits enforced per plan. Change or cancel anytime.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 ${
                billingCycle === 'monthly'
                  ? 'bg-[#F8FAFC] dark:bg-[#182238] text-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Monthly Billing
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('annual')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 ${
                billingCycle === 'annual'
                  ? 'bg-[#F8FAFC] dark:bg-[#182238] text-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Annual (2 Months Free)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {visible.map((plan) => {
            const cents =
              billingCycle === 'annual'
                ? Math.round(plan.annualPriceCents / 12)
                : plan.monthlyPriceCents;
            const isHighlighted = plan.slug === 'professional-cloud';
            return (
              <div
                key={plan.id}
                className={`flex flex-col justify-between p-6 rounded-lg border transition-colors duration-150 ${
                  isHighlighted
                    ? 'bg-[#111A2C] text-slate-100 border-blue-700'
                    : 'bg-[#F8FAFC] dark:bg-[#111A2C] text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-800 hover:border-blue-600 dark:hover:border-blue-600'
                }`}
              >
                <div>
                  <div
                    className={`text-xs font-medium ${
                      isHighlighted ? 'text-sky-300' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {plan.audienceLabel} | {plan.category.toUpperCase()}
                  </div>
                  <div className="flex items-baseline justify-between gap-4 mt-2">
                    <h3 className="text-xl font-semibold">{plan.name}</h3>
                    <div className="flex items-baseline gap-1 shrink-0">
                      <span className="text-3xl font-bold font-mono tabular-nums">
                        ${(cents / 100).toFixed(0)}
                      </span>
                      <span
                        className={`text-xs ${
                          isHighlighted ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        / mo
                      </span>
                    </div>
                  </div>
                  <p
                    className={`text-sm mt-3 leading-relaxed ${
                      isHighlighted ? 'text-slate-300' : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {plan.description}
                  </p>

                  <dl
                    className={`mt-5 pt-4 border-t grid grid-cols-2 gap-x-4 gap-y-2 text-xs ${
                      isHighlighted
                        ? 'border-slate-800'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div>
                      <dt className={isHighlighted ? 'text-slate-400' : 'text-slate-500'}>Compute</dt>
                      <dd className="font-mono tabular-nums mt-0.5">
                        {plan.cpuCores} vCPU, {plan.ramGb} GB RAM
                      </dd>
                    </div>
                    <div>
                      <dt className={isHighlighted ? 'text-slate-400' : 'text-slate-500'}>NVMe Storage</dt>
                      <dd className="font-mono tabular-nums mt-0.5">{plan.storageGb} GB</dd>
                    </div>
                    <div>
                      <dt className={isHighlighted ? 'text-slate-400' : 'text-slate-500'}>Quotas</dt>
                      <dd className="font-mono tabular-nums mt-0.5">
                        {plan.maxWebsites} sites, {plan.maxDatabases} DBs, {plan.maxDomains} domains
                      </dd>
                    </div>
                    <div>
                      <dt className={isHighlighted ? 'text-slate-400' : 'text-slate-500'}>Support SLA</dt>
                      <dd className="mt-0.5">{plan.supportLevel}</dd>
                    </div>
                  </dl>
                </div>

                <button
                  type="button"
                  onClick={() => onEnterConsole(plan.id)}
                  className="mt-6 w-full py-2.5 px-4 text-sm font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-slate-50 transition-colors duration-150 whitespace-nowrap shrink-0"
                >
                  {plan.monthlyPriceCents === 0 ? 'Start Free Sandbox' : 'Deploy with Plan'}
                </button>
              </div>
            );
          })}
        </div>

        {showMatrix && visible.length > 1 && (
          <div className="bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-300 dark:border-slate-800 rounded-lg overflow-x-auto">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-slate-100">
              Plan Specification Matrix
            </div>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-medium">Plan</th>
                  <th className="py-3 px-4 font-medium">vCPU / RAM</th>
                  <th className="py-3 px-4 font-medium">Storage</th>
                  <th className="py-3 px-4 font-medium">Bandwidth</th>
                  <th className="py-3 px-4 font-medium">Websites</th>
                  <th className="py-3 px-4 font-medium">Databases</th>
                  <th className="py-3 px-4 font-medium">Domains</th>
                  <th className="py-3 px-4 font-medium text-right">Monthly</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                {visible.map((p) => (
                  <tr key={p.id} className="hover:bg-[#EAEFF5] dark:hover:bg-[#182238] transition-colors">
                    <td className="py-3 px-4 font-sans font-semibold text-slate-900 dark:text-slate-100">
                      {p.name}
                    </td>
                    <td className="py-3 px-4">
                      {p.cpuCores} vCPU / {p.ramGb} GB
                    </td>
                    <td className="py-3 px-4">{p.storageGb} GB</td>
                    <td className="py-3 px-4">{p.bandwidthTb} TB</td>
                    <td className="py-3 px-4">{p.maxWebsites}</td>
                    <td className="py-3 px-4">{p.maxDatabases}</td>
                    <td className="py-3 px-4">{p.maxDomains}</td>
                    <td className="py-3 px-4 text-right font-semibold">
                      ${(p.monthlyPriceCents / 100).toFixed(0)}/mo
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderProductPage = (opts: {
    kicker: string;
    title: string;
    summary: string;
    specs: Array<{ label: string; detail: string }>;
    category?: HostingPlan['category'];
  }) => (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-12">
      <div className="flex flex-wrap items-center gap-1 p-1 bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-800 rounded-lg w-fit">
        {hostingProductTabs.map((t) => (
          <button
            key={t.route}
            type="button"
            onClick={() => onNavigate(t.route)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              route === t.route
                ? 'bg-[#F8FAFC] dark:bg-[#182238] text-slate-900 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
        <div className="lg:col-span-7 flex flex-col justify-center">
          <div className="text-xs font-medium text-blue-700 dark:text-sky-400 mb-3">
            {opts.kicker}
          </div>
          <h1
            className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
            style={{ textWrap: 'balance' }}
          >
            {opts.title}
          </h1>
          <p className="mt-4 text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
            {opts.summary}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => (isAuthenticated ? onEnterConsole() : onNavigate('register'))}
              className="px-5 py-2.5 text-sm font-medium bg-blue-700 hover:bg-blue-800 text-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {isAuthenticated ? 'Provision Environment' : 'Create Free Account'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('pricing')}
              className="px-5 py-2.5 text-sm font-medium bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-blue-600 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Compare All Plans
            </button>
          </div>
        </div>
        <div className="lg:col-span-5">
          <ResilientImage
            src={IMAGE_NODE}
            alt={opts.title}
            className="w-full h-72 lg:h-full object-cover rounded-lg border border-slate-300 dark:border-slate-800"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8 border-t border-slate-300 dark:border-slate-800 pt-10">
        {opts.specs.map((spec) => (
          <div
            key={spec.label}
            className="pt-4 border-t border-slate-300 dark:border-slate-800"
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {spec.label}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
              {spec.detail}
            </p>
          </div>
        ))}
      </div>

      {renderPlanCards(opts.category, false)}
    </div>
  );

  const isHostingRoute =
    route === 'cloud-hosting' ||
    route === 'web-hosting' ||
    route === 'vps-hosting' ||
    route === 'dedicated-servers' ||
    route === 'application-hosting';

  return (
    <div className="min-h-screen flex flex-col bg-[#F1F4F8] text-slate-900 dark:bg-[#0B111E] dark:text-slate-100">
      {/* Top Bar Contract: Solid opaque background, 3 exact zones separated by gap-8 */}
      <header className="sticky top-0 z-40 bg-[#F8FAFC] dark:bg-[#111A2C] border-b border-slate-300 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
          >
            <MCloudLogo className="w-7 h-7" />
            <span>MCloud</span>
          </button>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
            <button
              type="button"
              onClick={() => onNavigate('cloud-hosting')}
              className={`hover:text-slate-900 dark:hover:text-slate-100 underline-offset-8 transition-colors whitespace-nowrap shrink-0 ${
                isHostingRoute ? 'text-slate-900 dark:text-slate-100 underline' : 'hover:underline'
              }`}
            >
              Hosting
            </button>
            <button
              type="button"
              onClick={() => onNavigate('pricing')}
              className={`hover:text-slate-900 dark:hover:text-slate-100 underline-offset-8 transition-colors whitespace-nowrap shrink-0 ${
                route === 'pricing' ? 'text-slate-900 dark:text-slate-100 underline' : 'hover:underline'
              }`}
            >
              Pricing
            </button>
            <button
              type="button"
              onClick={() => onNavigate('features')}
              className={`hover:text-slate-900 dark:hover:text-slate-100 underline-offset-8 transition-colors whitespace-nowrap shrink-0 ${
                route === 'features' ? 'text-slate-900 dark:text-slate-100 underline' : 'hover:underline'
              }`}
            >
              Architecture
            </button>
            <button
              type="button"
              onClick={() => onNavigate('docs')}
              className={`hover:text-slate-900 dark:hover:text-slate-100 underline-offset-8 transition-colors whitespace-nowrap shrink-0 ${
                route === 'docs' ? 'text-slate-900 dark:text-slate-100 underline' : 'hover:underline'
              }`}
            >
              Docs
            </button>
            <button
              type="button"
              onClick={() => onNavigate('contact')}
              className={`hover:text-slate-900 dark:hover:text-slate-100 underline-offset-8 transition-colors whitespace-nowrap shrink-0 ${
                route === 'contact' ? 'text-slate-900 dark:text-slate-100 underline' : 'hover:underline'
              }`}
            >
              Contact
            </button>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => (isAuthenticated ? onEnterConsole() : onNavigate('register'))}
              className="px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-slate-50 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0"
            >
              {isAuthenticated ? 'Open Console' : 'Sign Up'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {route === 'home' && (
          <div>
            {/* 1. Architectural Hero Split */}
            <section className="border-b border-slate-300 dark:border-slate-800 bg-[#F8FAFC] dark:bg-[#111A2C]">
              <div className="max-w-7xl mx-auto px-6 pt-14 pb-16">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
                  <div className="lg:col-span-6 flex flex-col justify-center">
                    <div className="text-xs font-medium text-blue-700 dark:text-sky-400 mb-3">
                      Cloud Hosting & Compute
                    </div>
                    <h1
                      className="font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-[1.08]"
                      style={{
                        fontSize: 'clamp(2.35rem, 4.2vw, 3.75rem)',
                        textWrap: 'balance',
                      }}
                    >
                      Deploy sites, servers, and databases from one console.
                    </h1>
                    <p className="mt-5 text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                      Provision websites, VPS compute, DNS zones, managed PostgreSQL and MySQL databases, scoped file roots, and Git deployments in one account.
                    </p>

                    <div className="mt-8 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          isAuthenticated ? onEnterConsole() : onNavigate('register')
                        }
                        className="px-5 py-3 text-sm font-medium bg-blue-700 hover:bg-blue-800 text-slate-50 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0"
                      >
                        {isAuthenticated ? 'Open Your Console' : 'Create Free Account'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigate('pricing')}
                        className="px-5 py-3 text-sm font-medium bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 hover:border-blue-600 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0"
                      >
                        View Hosting Plans
                      </button>
                      {!isAuthenticated && (
                        <button
                          type="button"
                          onClick={() => onNavigate('login')}
                          className="px-3 py-3 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 underline-offset-4 hover:underline whitespace-nowrap shrink-0"
                        >
                          Sign In
                        </button>
                      )}
                    </div>

                    <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>40+ Worldwide Zones</span>
                      <span aria-hidden="true">|</span>
                      <span>Live Resource Telemetry</span>
                      <span aria-hidden="true">|</span>
                      <span>HttpOnly Session & Bcrypt Auth</span>
                    </div>
                  </div>

                  <div className="lg:col-span-6 flex flex-col">
                    <div className="flex-1 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-800 bg-[#0E1626]">
                      <ResilientImage
                        src={IMAGE_HERO}
                        alt="MCloud server rack corridor"
                        className="w-full h-72 lg:h-[330px] object-cover"
                      />
                      <div className="p-5 bg-[#111A2C] text-slate-100 border-t border-slate-800">
                        <div className="text-xs font-mono text-sky-400">
                          Worldwide Cluster Footprint
                        </div>
                        <div className="text-sm font-semibold mt-1">
                          Americas, Europe, Middle East, Africa, Asia-Pacific & Oceania
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          Global Anycast edge and regional compute nodes with SHA-256 verified snapshots.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4-column Architectural KPI Strip */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mt-12 pt-8 border-t border-slate-200 dark:border-slate-800">
                  <div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      {Math.max(zoneCount, ALL_GLOBAL_REGIONS.length)}+ Zones
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Worldwide availability across all continents
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      99.98%
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Target availability across managed environments
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      8 DNS Types
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      A, AAAA, CNAME, MX, TXT, NS, SRV, and CAA
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      5 Runtimes
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Static, Node.js, PHP, Python, Docker
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 2. Platform Architecture Capabilities (2-column split, no terminal window, no bento) */}
            <section className="max-w-7xl mx-auto px-6 py-16">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                <div className="lg:col-span-5 space-y-6">
                  <div>
                    <div className="text-xs font-medium text-blue-700 dark:text-sky-400">
                      Platform Capabilities
                    </div>
                    <h2
                      className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 mt-1.5"
                      style={{ textWrap: 'balance' }}
                    >
                      Web runtimes, DNS, databases, and deploys.
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                      Configure site roots, edit DNS zones, allocate databases, and push Git releases from a single workspace.
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    {[
                      {
                        id: 'runtime' as const,
                        label: 'Runtimes',
                        title: 'Multi-Runtime Web Hosting',
                        desc: 'Configure Node.js, PHP, Python, Docker, and Static document roots with TLS.',
                      },
                      {
                        id: 'dns' as const,
                        label: 'DNS Zones',
                        title: 'Authoritative DNS Zone Editor',
                        desc: 'Manage A, AAAA, CNAME, MX, TXT, NS, SRV, and CAA records per domain.',
                      },
                      {
                        id: 'database' as const,
                        label: 'Databases',
                        title: 'Managed Database Provisioning',
                        desc: 'Create PostgreSQL, MySQL, and MariaDB instances with hashed user passwords.',
                      },
                      {
                        id: 'deploy' as const,
                        label: 'Deployments',
                        title: 'Build History & Rollbacks',
                        desc: 'Deploy from GitHub, GitLab, or archives with build logs and instant rollbacks.',
                      },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setWorkbenchTab(item.id)}
                        className={`w-full text-left p-4 rounded-lg border transition-colors duration-150 ${
                          workbenchTab === item.id
                            ? 'bg-[#F8FAFC] dark:bg-[#111A2C] border-blue-700'
                            : 'bg-transparent border-slate-300 dark:border-slate-800 hover:bg-[#F8FAFC] dark:hover:bg-[#111A2C]'
                        }`}
                      >
                        <div className="text-xs font-mono text-blue-700 dark:text-sky-400">
                          {item.label}
                        </div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                          {item.title}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                          {item.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Structured Specification Panel */}
                <div className="lg:col-span-7 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-300 dark:border-slate-800 rounded-lg overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {workbenchTab === 'runtime'
                        ? 'Specification: Web Runtimes & SSL'
                        : workbenchTab === 'dns'
                          ? 'Specification: DNS Record Matrix'
                          : workbenchTab === 'database'
                            ? 'Specification: Database Engines & Credentials'
                            : 'Specification: Deployment Lifecycle'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        isAuthenticated ? onEnterConsole() : onNavigate('register')
                      }
                      className="text-blue-700 dark:text-sky-400 hover:underline font-medium whitespace-nowrap"
                    >
                      Open Live Console
                    </button>
                  </div>

                  <div className="p-6 space-y-5 min-h-[340px]">
                    {workbenchTab === 'runtime' && (
                      <div className="space-y-4">
                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                          Each website binds to a verified hosting account and enforces plan quotas server-side before provisioning.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          {[
                            ['Node.js 22', 'Serverless & Express API runtimes with custom start scripts'],
                            ['PHP 8.3', 'Isolated FastCGI workers with configurable document roots'],
                            ['Python 3.12', 'WSGI/ASGI web workloads with environment variable injection'],
                            ['Docker & Static', 'Containerized services or edge-cached static asset roots'],
                          ].map(([title, desc]) => (
                            <div
                              key={title}
                              className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-[#EAEFF5] dark:bg-[#0E1626]"
                            >
                              <div className="font-semibold text-slate-900 dark:text-slate-100">
                                {title}
                              </div>
                              <div className="text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                                {desc}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {workbenchTab === 'dns' && (
                      <div className="space-y-3 text-xs">
                        <div className="text-slate-600 dark:text-slate-400">
                          Authoritative Nameservers: ns1.mcloud.host, ns2.mcloud.host
                        </div>
                        <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                          {[
                            ['A', '@', '10.24.10.11', '3600'],
                            ['AAAA', '@', '2001:db8::1', '3600'],
                            ['CNAME', 'www', 'example.com', '3600'],
                            ['MX', '@', '10 mail.mcloud.host', '3600'],
                            ['TXT', '@', 'v=spf1 include:_spf.mcloud.host ~all', '3600'],
                            ['CAA', '@', '0 issue "letsencrypt.org"', '3600'],
                          ].map(([type, host, val, ttl]) => (
                            <div
                              key={`${type}-${host}`}
                              className="px-3.5 py-2.5 grid grid-cols-12 gap-2 items-center"
                            >
                              <span className="col-span-2 text-blue-700 dark:text-sky-400 font-semibold">
                                {type}
                              </span>
                              <span className="col-span-2 text-slate-900 dark:text-slate-100">
                                {host}
                              </span>
                              <span className="col-span-6 text-slate-600 dark:text-slate-400 truncate">
                                {val}
                              </span>
                              <span className="col-span-2 text-right text-slate-500 tabular-nums">
                                {ttl}s
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {workbenchTab === 'database' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          {[
                            ['PostgreSQL 16.4 (Port 5432)', 'Primary Cloud SQL control plane and tenant logical schemas'],
                            ['MySQL 8.0 & MariaDB 11.4', 'Logical database allocation with read/write or read-only roles'],
                          ].map(([eng, desc]) => (
                            <div
                              key={eng}
                              className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-[#EAEFF5] dark:bg-[#0E1626]"
                            >
                              <div className="font-semibold text-slate-900 dark:text-slate-100">
                                {eng}
                              </div>
                              <div className="text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                                {desc}
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          Account passwords, database user passwords, and workspace SFTP secrets are salted and encrypted with bcrypt before storage in PostgreSQL, and connection strings remain masked by default.
                        </p>
                      </div>
                    )}

                    {workbenchTab === 'deploy' && (
                      <div className="space-y-3 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {[
                            ['01. Source Validation', 'Validates GitHub, GitLab, or archive coordinates without executing host shell scripts.'],
                            ['02. Isolated Build Queue', 'Tracks commit hash, branch, build command, and start command in PostgreSQL.'],
                            ['03. Health Verification', 'Verifies release readiness and broadcasts live deployment events via WebSocket.'],
                            ['04. Instant Rollback', 'Restores active traffic to any prior healthy release record in one click.'],
                          ].map(([step, detail]) => (
                            <div
                              key={step}
                              className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-[#EAEFF5] dark:bg-[#0E1626]"
                            >
                              <div className="font-semibold text-slate-900 dark:text-slate-100">
                                {step}
                              </div>
                              <div className="text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                                {detail}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* 3. Hosting Product Categories (Strictly 2-column alternating layout, no 3-in-a-row, no bento) */}
            <section className="max-w-7xl mx-auto px-6 py-16 border-t border-slate-300 dark:border-slate-800">
              <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
                <div>
                  <div className="text-xs font-medium text-blue-700 dark:text-sky-400">
                    Hosting & Compute
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 mt-1">
                    Hosting Plans & Server Tiers
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('features')}
                  className="text-sm font-medium text-blue-700 dark:text-sky-400 hover:underline whitespace-nowrap"
                >
                  Inspect Architecture
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-7 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-300 dark:border-slate-800 rounded-lg flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      Cloud & Shared Web
                    </div>
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-2">
                      Managed Cloud & Web Hosting
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                      Host static sites, Node.js APIs, Python apps, or PHP sites with scoped file editing, SFTP rotation, and TLS configuration.
                    </p>
                  </div>
                  <div className="mt-6 flex flex-wrap gap-4 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => onNavigate('cloud-hosting')}
                      className="text-blue-700 dark:text-sky-400 hover:underline"
                    >
                      Cloud Hosting
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('web-hosting')}
                      className="text-blue-700 dark:text-sky-400 hover:underline"
                    >
                      Web Hosting
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('application-hosting')}
                      className="text-blue-700 dark:text-sky-400 hover:underline"
                    >
                      Application Hosting
                    </button>
                  </div>
                </div>

                <div className="p-7 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-300 dark:border-slate-800 rounded-lg flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      Virtual & Bare Metal
                    </div>
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-2">
                      VPS & Dedicated Servers
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                      Dedicated vCPU, ECC RAM, and NVMe allocations with start, stop, and restart power controls plus live resource telemetry.
                    </p>
                  </div>
                  <div className="mt-6 flex gap-4 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => onNavigate('vps-hosting')}
                      className="text-blue-700 dark:text-sky-400 hover:underline"
                    >
                      VPS Hosting
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('dedicated-servers')}
                      className="text-blue-700 dark:text-sky-400 hover:underline"
                    >
                      Dedicated Servers
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* 4. Security & Isolation */}
            <section className="max-w-7xl mx-auto px-6 py-16 border-t border-slate-300 dark:border-slate-800">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
                <div className="lg:col-span-5">
                  <ResilientImage
                    src={IMAGE_VAULT}
                    alt="Network routing racks inside MCloud facility"
                    className="w-full h-72 lg:h-full object-cover rounded-lg border border-slate-300 dark:border-slate-800"
                  />
                </div>
                <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
                  <div>
                    <div className="text-xs font-medium text-blue-700 dark:text-sky-400">
                      Security & Isolation
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 mt-1.5">
                      Credential Hashing and Account Isolation
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                    {[
                      {
                        title: 'Bcrypt Password & Key Hashing',
                        text: 'Salted bcrypt encryption (cost factor 12) hashes account passwords, database user passwords, SFTP secrets, and rotated API keys.',
                      },
                      {
                        title: 'HttpOnly Signed Sessions',
                        text: 'Sessions are stored in HttpOnly cookies with HMAC-SHA256 signatures and can be inspected or revoked individually.',
                      },
                      {
                        title: 'Traversal-Safe File Manager',
                        text: 'Path validation locks file browsing, creation, editing, and permissions strictly inside each hosting root.',
                      },
                      {
                        title: 'SHA-256 Verified Snapshots',
                        text: 'Manual and scheduled backups compute cryptographic digests and log activity without exposing raw secrets.',
                      },
                    ].map((item) => (
                      <div
                        key={item.title}
                        className="pt-4 border-t border-slate-300 dark:border-slate-800"
                      >
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {item.title}
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                          {item.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* 5. Pricing Section */}
            <section className="max-w-7xl mx-auto px-6 py-16 border-t border-slate-300 dark:border-slate-800">
              {renderPlanCards(undefined, true)}
            </section>

            {/* 6. FAQ (Zero fake testimonials) */}
            <section className="max-w-4xl mx-auto px-6 py-16 border-t border-slate-300 dark:border-slate-800">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 mb-6">
                Frequently Asked Questions
              </h2>
              <div className="divide-y divide-slate-300 dark:divide-slate-800 border-y border-slate-300 dark:border-slate-800">
                {faqs.map((item, idx) => (
                  <div key={item.q} className="py-4">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                      className="w-full flex items-center justify-between text-left text-sm font-medium text-slate-900 dark:text-slate-100"
                    >
                      <span>{item.q}</span>
                      {openFaq === idx ? (
                        <ChevronUpIcon className="w-4 h-4 text-slate-500 shrink-0" />
                      ) : (
                        <ChevronDownIcon className="w-4 h-4 text-slate-500 shrink-0" />
                      )}
                    </button>
                    {openFaq === idx && (
                      <p className="mt-2.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                        {item.a}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* 7. Final Conversion Banner */}
            <section className="border-t border-slate-300 dark:border-slate-800 bg-[#111A2C] text-slate-100">
              <div className="max-w-7xl mx-auto px-6 py-16 flex flex-col md:flex-row md:items-center justify-between gap-8">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                    Start with a free Developer Sandbox.
                  </h2>
                  <p className="text-sm text-slate-300 mt-2 max-w-xl">
                    Create an account and provision a $0 sandbox or monthly compute plan with websites, DNS zones, databases, and file management.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      isAuthenticated ? onEnterConsole() : onNavigate('register')
                    }
                    className="px-5 py-3 text-sm font-medium bg-blue-700 hover:bg-blue-600 text-slate-50 rounded-lg transition-colors whitespace-nowrap"
                  >
                    {isAuthenticated ? 'Open Console' : 'Create Free Account'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('contact')}
                    className="px-5 py-3 text-sm font-medium border border-slate-700 hover:bg-[#182238] text-slate-100 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Contact Sales
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {route === 'cloud-hosting' &&
          renderProductPage({
            kicker: 'Product | Elastic Cloud Hosting',
            title: 'Managed Cloud Hosting with Tenant Isolation',
            summary:
              'Run customer websites, databases, and background workloads inside isolated cloud environments with enforced quotas and live node telemetry.',
            specs: [
              { label: 'Automated SSL', detail: 'TLS provisioning state per domain and website.' },
              {
                label: 'Worldwide Nodes',
                detail:
                  'Deploy across North & South America, Europe, Middle East, Africa, Asia-Pacific, Oceania, or specify any custom location worldwide.',
              },
              { label: 'Checksum Backups', detail: 'Manual and scheduled snapshots verified with SHA-256.' },
              { label: 'Scoped Account Security', detail: 'HttpOnly signed sessions, masked IP logs, and per-account resource ownership checks.' },
            ],
          })}

        {route === 'web-hosting' &&
          renderProductPage({
            kicker: 'Product | Shared Web Hosting',
            title: 'Sandboxed Shared Web Hosting',
            summary:
              'Host static sites, PHP applications, and web services with scoped SFTP/file editing, custom document roots, and integrated DNS management.',
            category: 'shared',
            specs: [
              { label: 'Document Root Control', detail: 'Configure custom public paths and HTTP redirects.' },
              { label: 'Scoped File Manager', detail: 'Create, edit, rename, and chmod files inside your root.' },
              { label: 'Managed DNS Zones', detail: 'Full A, AAAA, CNAME, MX, TXT, NS, SRV, and CAA support.' },
              { label: 'Zero-Cost Sandbox', detail: 'Test web hosting immediately on the $0 Developer Sandbox.' },
            ],
          })}

        {route === 'vps-hosting' &&
          renderProductPage({
            kicker: 'Product | Virtual Private Servers',
            title: 'Dedicated vCPU & RAM VPS Hosting',
            summary:
              'Scale predictable compute slices with start, stop, and restart lifecycle controls routed through the MCloud compute API.',
            category: 'vps',
            specs: [
              { label: 'Power Lifecycle Controls', detail: 'Start, stop, and restart VPS instances with audit logs.' },
              { label: 'Real-Time Telemetry', detail: 'WebSocket CPU, memory, and bandwidth streaming.' },
              { label: 'NVMe Storage', detail: 'Up to 320 GB high-IOPS storage per virtual slice.' },
              { label: 'Linux Distributions', detail: 'Ubuntu 24.04 LTS, Debian 12, and Rocky Linux images.' },
            ],
          })}

        {route === 'dedicated-servers' &&
          renderProductPage({
            kicker: 'Product | Bare Metal Infrastructure',
            title: 'Single-Tenant Dedicated Servers',
            summary:
              'Reserve dedicated physical compute capacity for compliance-sensitive workloads, heavy database clusters, and multi-service environments.',
            category: 'dedicated',
            specs: [
              { label: '24+ Physical Cores', detail: 'Zero noisy neighbors with single-tenant node assignment.' },
              { label: '64 GB+ ECC Memory', detail: 'Built for stateful PostgreSQL and heavy API traffic.' },
              { label: '2 TB NVMe Storage', detail: 'Redundant storage arrays with verified off-site backups.' },
              { label: '15-Minute SLA', detail: 'Direct escalation path to MCloud platform engineers.' },
            ],
          })}

        {route === 'application-hosting' &&
          renderProductPage({
            kicker: 'Product | Git-Backed PaaS',
            title: 'Application Hosting with Isolated Build Pipelines',
            summary:
              'Connect GitHub, GitLab, or archive sources, set build and start commands, track deployment logs, and roll back releases in seconds.',
            category: 'application',
            specs: [
              { label: 'Git & Archive Sources', detail: 'Deploy from GitHub, GitLab, or uploaded archives.' },
              { label: 'Controlled Builds', detail: 'Never executes untrusted scripts directly on the host OS.' },
              { label: 'Instant Rollbacks', detail: 'Revert active traffic to any prior healthy release.' },
              { label: 'Environment Variables', detail: 'Manage runtime configuration per website or app.' },
            ],
          })}

        {route === 'pricing' && (
          <div className="max-w-7xl mx-auto px-6 py-14 space-y-12">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                MCloud Hosting & Compute Pricing
              </h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
                Every tier enforces clear storage, website, database, and domain limits in the API. Use coupon{' '}
                <code className="font-mono text-blue-700 dark:text-sky-400">MCLOUD20</code> in Sandbox Checkout for 20% off.
              </p>
            </div>
            {renderPlanCards(undefined, true)}
          </div>
        )}

        {route === 'features' && (
          <div className="max-w-6xl mx-auto px-6 py-14 space-y-10">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Platform Architecture & Capabilities
              </h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
                Built around per-account isolation, credential hashing, and transparent resource limits.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  title: 'Normalized Relational Control Plane',
                  body: 'Tracks accounts, subscriptions, regional nodes, websites, DNS records, managed databases, files, deployments, backups, invoices, and support tickets.',
                },
                {
                  title: 'WebSocket Telemetry & Build Events',
                  body: 'Authenticated WebSocket sessions stream node CPU, memory, and network Mbps metrics alongside deployment and backup completion events.',
                },
                {
                  title: 'Traversal-Safe Hosting File Manager',
                  body: 'Browse, search, create, edit, chmod, and delete files strictly within your provisioned hosting account root.',
                },
                {
                  title: 'Salted Bcrypt Hashing & HttpOnly Sessions',
                  body: 'Account passwords, database user passwords, SFTP secrets, and API keys are hashed with bcrypt, and login tokens stay inside HttpOnly cookies.',
                },
              ].map((feat) => (
                <div
                  key={feat.title}
                  className="p-6 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-300 dark:border-slate-800 rounded-lg"
                >
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {feat.title}
                  </h2>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {feat.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {route === 'about' && (
          <div className="max-w-4xl mx-auto px-6 py-14 space-y-6">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              About MCloud
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              MCloud gives engineering teams and agencies one control plane for managing web applications, domains, databases, server nodes, backups, and billing without fragmented tools.
            </p>
            <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              Every infrastructure action, from VPS power controls to DNS zone updates and backup verification, executes with strict ownership checks and recorded activity history.
            </p>
          </div>
        )}

        {route === 'docs' && (
          <div className="max-w-5xl mx-auto px-6 py-14 space-y-8">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                MCloud Platform Documentation
              </h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
                Guide to provisioning hosting environments, connecting domains, managing databases, editing files, and configuring scheduled backups inside your workspace.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  category: 'Hosting & Compute',
                  title: 'Creating & Managing Hosting Environments',
                  body: 'Select a $0 Developer Sandbox or paid compute plan, pick any region worldwide, and manage VPS power states (start, stop, restart) or SFTP credential rotation directly from Hosting & Plans.',
                },
                {
                  category: 'Websites & Runtimes',
                  title: 'Deploying Websites & Configuring TLS',
                  body: 'Create Static, Node.js, PHP, Python, or Docker sites with custom document roots, runtime environment variables, HTTP redirects, and SSL status tracking.',
                },
                {
                  category: 'Domains & DNS',
                  title: 'Authoritative DNS Zone Management',
                  body: 'Connect existing domains or sandbox-register new ones, then add or remove A, AAAA, CNAME, MX, TXT, NS, SRV, and CAA records with configurable TTL and priority.',
                },
                {
                  category: 'Databases & File Manager',
                  title: 'Managed Databases, Files & Snapshots',
                  body: 'Provision PostgreSQL, MySQL, or MariaDB databases with scoped user credentials, edit files inside your public root, trigger Git deployments, and verify SHA-256 backup snapshots.',
                },
              ].map((doc) => (
                <div
                  key={doc.title}
                  className="p-6 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-300 dark:border-slate-800 rounded-lg space-y-2"
                >
                  <div className="text-xs font-mono text-blue-700 dark:text-sky-400">
                    {doc.category}
                  </div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {doc.title}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {doc.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="p-6 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-300 dark:border-slate-800 rounded-lg flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Ready to configure your hosting workspace?
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Open the Customer Console to manage websites, DNS, databases, deployments, and active device sessions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => (isAuthenticated ? onEnterConsole() : onNavigate('register'))}
                className="px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-slate-50 rounded-lg transition-colors whitespace-nowrap"
              >
                {isAuthenticated ? 'Open Console' : 'Create Free Account'}
              </button>
            </div>
          </div>
        )}

        {route === 'support' && (
          <div className="max-w-4xl mx-auto px-6 py-14 space-y-8">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              MCloud Support Center
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Signed-in customers can open prioritized support tickets directly inside the Customer Dashboard, attach reference filenames, and track agent responses in real time.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => (isAuthenticated ? onEnterConsole() : onNavigate('register'))}
                className="px-5 py-2.5 text-sm font-medium bg-blue-700 hover:bg-blue-800 text-slate-50 rounded-lg transition-colors"
              >
                {isAuthenticated ? 'Open Support Ticket in Console' : 'Sign Up for Support Access'}
              </button>
              <button
                type="button"
                onClick={() => onNavigate('contact')}
                className="px-5 py-2.5 text-sm font-medium bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                General Contact Form
              </button>
            </div>
          </div>
        )}

        {route === 'contact' && (
          <div className="max-w-3xl mx-auto px-6 py-14">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Contact MCloud Infrastructure Team
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Inquiries are validated and logged for MCloud infrastructure team review.
            </p>

            <form
              onSubmit={handleContactSubmit}
              className="mt-8 p-6 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-300 dark:border-slate-800 rounded-lg space-y-5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Full Name
                  </label>
                  <input
                    required
                    value={contactForm.name}
                    onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="David Chen"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Work Email
                  </label>
                  <input
                    required
                    type="email"
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="david@company.example"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Company / Organization
                  </label>
                  <input
                    value={contactForm.company}
                    onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Topic
                  </label>
                  <select
                    value={contactForm.topic}
                    onChange={(e) => setContactForm({ ...contactForm, topic: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="sales">Enterprise & Custom Infrastructure</option>
                    <option value="migration">Workload Migration</option>
                    <option value="security">Security & Compliance</option>
                    <option value="support">Technical Support</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Message
                </label>
                <textarea
                  required
                  minLength={10}
                  rows={4}
                  value={contactForm.message}
                  onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="Describe your hosting requirements or question..."
                />
              </div>

              {contactStatus.type === 'success' && (
                <div className="p-3 text-sm bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-lg">
                  {contactStatus.text}
                </div>
              )}

              {contactStatus.type === 'error' && (
                <div className="p-3 text-sm bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-200 rounded-lg">
                  {contactStatus.text}
                </div>
              )}

              <button
                type="submit"
                disabled={contactStatus.type === 'submitting'}
                className="px-5 py-2.5 text-sm font-medium bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-slate-50 rounded-lg transition-colors"
              >
                {contactStatus.type === 'submitting' ? 'Sending...' : 'Send Inquiry'}
              </button>
            </form>
          </div>
        )}

        {/* Dedicated Sign-Up & Sign-In Split View (No checkmark bullets, Privacy Policy link only, No TOS) */}
        {(route === 'login' || route === 'register') && (
          <div className="max-w-6xl mx-auto px-6 py-12">
            <div className="grid grid-cols-1 lg:grid-cols-12 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-800 bg-[#F8FAFC] dark:bg-[#111A2C]">
              <div className="lg:col-span-5 bg-[#111A2C] text-slate-100 p-8 sm:p-10 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800">
                <div>
                  <div className="flex items-center gap-2.5 text-base font-bold">
                    <MCloudLogo className="w-7 h-7" />
                    <span>MCloud</span>
                  </div>
                  <h1
                    className="text-2xl sm:text-3xl font-bold tracking-tight mt-8"
                    style={{ textWrap: 'balance' }}
                  >
                    {route === 'register'
                      ? 'Create an MCloud account.'
                      : 'Sign in to MCloud.'}
                  </h1>
                  <p className="text-sm text-slate-300 mt-3 leading-relaxed">
                    Provision websites, VPS instances, DNS zones, managed databases, and deployments from one account.
                  </p>

                  <ul className="mt-8 space-y-2.5 text-xs text-slate-300 border-t border-slate-800 pt-6">
                    <li>$0 Developer Sandbox tier available immediately</li>
                    <li>PostgreSQL, MySQL, and MariaDB database support</li>
                    <li>Bcrypt password and credential hashing (cost 12)</li>
                    <li>Live WebSocket telemetry and SHA-256 verified backups</li>
                  </ul>
                </div>

                <div className="mt-10 pt-6 border-t border-slate-800 text-xs text-slate-400">
                  Worldwide Regions | HttpOnly Cookie Sessions | Bcrypt Auth
                </div>
              </div>

              <div className="lg:col-span-7 p-8 sm:p-10 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1 p-1 bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-800 rounded-lg w-fit mb-6">
                    <button
                      type="button"
                      onClick={() => {
                        setLocalAuthError(null);
                        onNavigate('register');
                      }}
                      className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        route === 'register'
                          ? 'bg-[#F8FAFC] dark:bg-[#182238] text-slate-900 dark:text-slate-100'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      Sign Up
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLocalAuthError(null);
                        onNavigate('login');
                      }}
                      className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        route === 'login'
                          ? 'bg-[#F8FAFC] dark:bg-[#182238] text-slate-900 dark:text-slate-100'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      Sign In
                    </button>
                  </div>

                  {(localAuthError || authError) && (
                    <div className="mb-5 p-3 text-xs bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg">
                      {localAuthError || authError}
                    </div>
                  )}

                  {route === 'register' ? (
                    <form onSubmit={handleSignupSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                            Full Name
                          </label>
                          <input
                            required
                            minLength={2}
                            value={signupForm.fullName}
                            onChange={(e) =>
                              setSignupForm({ ...signupForm, fullName: e.target.value })
                            }
                            placeholder="Samira Patel"
                            className="w-full px-3 py-2.5 text-sm bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                            Organization / Workspace
                          </label>
                          <input
                            required
                            minLength={2}
                            value={signupForm.organizationName}
                            onChange={(e) =>
                              setSignupForm({
                                ...signupForm,
                                organizationName: e.target.value,
                              })
                            }
                            placeholder="Northbridge Studio"
                            className="w-full px-3 py-2.5 text-sm bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                            Work Email
                          </label>
                          <input
                            required
                            type="email"
                            autoComplete="email"
                            value={signupForm.email}
                            onChange={(e) =>
                              setSignupForm({ ...signupForm, email: e.target.value })
                            }
                            placeholder="samira@northbridge.example"
                            className="w-full px-3 py-2.5 text-sm bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                            Password
                          </label>
                          <input
                            required
                            type="password"
                            minLength={8}
                            autoComplete="new-password"
                            value={signupForm.password}
                            onChange={(e) =>
                              setSignupForm({ ...signupForm, password: e.target.value })
                            }
                            placeholder="Min 8 chars, letter + number"
                            className="w-full px-3 py-2.5 text-sm bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          Preferred Cluster Region (Worldwide)
                        </label>
                        <select
                          value={signupForm.region}
                          onChange={(e) =>
                            setSignupForm({ ...signupForm, region: e.target.value })
                          }
                          className="w-full px-3 py-2.5 text-sm bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                        >
                          {GLOBAL_REGION_GROUPS.map((group) => (
                            <optgroup key={group.continent} label={group.continent}>
                              {group.regions.map((region) => (
                                <option key={region} value={region}>
                                  {region}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                          <optgroup label="Custom Global Location">
                            <option value="__custom__">
                              Other / Enter any city or country worldwide...
                            </option>
                          </optgroup>
                        </select>
                        {signupForm.region === '__custom__' && (
                          <input
                            required
                            minLength={2}
                            maxLength={100}
                            value={signupForm.customRegion}
                            onChange={(e) =>
                              setSignupForm({ ...signupForm, customRegion: e.target.value })
                            }
                            placeholder="e.g., Accra, Ghana or Reykjavik, Iceland"
                            className="mt-2 w-full px-3 py-2.5 text-sm bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        )}
                      </div>

                      <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-300 dark:border-slate-800 bg-[#EAEFF5] dark:bg-[#0E1626] text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={signupForm.activateSandbox}
                          onChange={(e) =>
                            setSignupForm({
                              ...signupForm,
                              activateSandbox: e.target.checked,
                            })
                          }
                          className="mt-0.5"
                        />
                        <span>
                          Pre-select the <strong>$0 Developer Sandbox</strong> plan immediately after sign-up so I can launch a test environment right away.
                        </span>
                      </label>

                      <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={signupForm.acceptedPrivacy}
                          onChange={(e) =>
                            setSignupForm({
                              ...signupForm,
                              acceptedPrivacy: e.target.checked,
                            })
                          }
                          className="mt-0.5"
                        />
                        <span>
                          I accept the{' '}
                          <button
                            type="button"
                            onClick={() => onNavigate('privacy')}
                            className="underline text-slate-900 dark:text-slate-100"
                          >
                            Privacy Policy
                          </button>
                          .
                        </span>
                      </label>

                      <button
                        type="submit"
                        disabled={authBusy}
                        className="w-full py-3 px-4 text-sm font-medium bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-slate-50 rounded-lg transition-colors duration-150"
                      >
                        {authBusy
                          ? 'Encrypting Password & Creating Account...'
                          : 'Create MCloud Account'}
                      </button>

                      <div className="pt-2">
                        <button
                          type="button"
                          disabled={authBusy}
                          onClick={handleGoogleAuthAction}
                          className="w-full py-2.5 px-4 text-xs font-medium bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-blue-600 disabled:opacity-60 rounded-lg transition-colors duration-150"
                        >
                          Or Continue with Google
                        </button>
                      </div>

                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Your password is encrypted using salted bcrypt (cost factor 12) before persistence in Cloud SQL PostgreSQL. Plaintext passwords are never stored or transmitted back to clients.
                      </p>
                    </form>
                  ) : (
                    <form onSubmit={handlePasswordLoginSubmit} className="space-y-4">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                          Sign in to your MCloud workspace
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                          Sign in with your email and password or Google account to enter your hosting console.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          Email Address
                        </label>
                        <input
                          required
                          type="email"
                          autoComplete="email"
                          value={loginForm.email}
                          onChange={(e) =>
                            setLoginForm({ ...loginForm, email: e.target.value })
                          }
                          placeholder="samira@northbridge.example"
                          className="w-full px-3 py-2.5 text-sm bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          Password
                        </label>
                        <input
                          required
                          type="password"
                          autoComplete="current-password"
                          value={loginForm.password}
                          onChange={(e) =>
                            setLoginForm({ ...loginForm, password: e.target.value })
                          }
                          placeholder="Enter your password"
                          className="w-full px-3 py-2.5 text-sm bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={authBusy}
                        className="w-full py-3 px-4 text-sm font-medium bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-slate-50 rounded-lg transition-colors duration-150"
                      >
                        {authBusy ? 'Verifying Credentials...' : 'Sign In'}
                      </button>

                      <button
                        type="button"
                        disabled={authBusy}
                        onClick={handleGoogleAuthAction}
                        className="w-full py-2.5 px-4 text-xs font-medium bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-blue-600 disabled:opacity-60 rounded-lg transition-colors duration-150"
                      >
                        Continue with Google
                      </button>

                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        New to MCloud?{' '}
                        <button
                          type="button"
                          onClick={() => onNavigate('register')}
                          className="text-blue-700 dark:text-sky-400 font-medium hover:underline"
                        >
                          Create a free account
                        </button>
                      </p>
                    </form>
                  )}
                </div>

                <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Bcrypt Encryption & HttpOnly Session Cookies</span>
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
                  >
                    {theme === 'dark' ? (
                      <SunIcon className="w-3.5 h-3.5" />
                    ) : (
                      <MoonIcon className="w-3.5 h-3.5" />
                    )}
                    <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {route === 'privacy' && (
          <div className="max-w-4xl mx-auto px-6 py-14 space-y-5">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              Privacy Policy
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              MCloud stores only the profile, session, billing invoice metadata, and infrastructure configuration records necessary to operate your hosting environments. Raw credit card numbers are never collected or stored.
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              All account passwords, database user passwords, SFTP secrets, and rotated workspace API keys are salted and encrypted with bcrypt prior to storage in Cloud SQL PostgreSQL.
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              You may inspect active device sessions, revoke sessions, or permanently delete your MCloud account and associated resources from Account Settings at any time.
            </p>
          </div>
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-300 dark:border-slate-800 bg-[#F8FAFC] dark:bg-[#111A2C]">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 text-sm">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
                <MCloudLogo className="w-6 h-6" />
                <span>MCloud</span>
              </div>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Cloud hosting, server management, and deployment control plane.
              </p>
              <button
                type="button"
                onClick={toggleTheme}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
              >
                {theme === 'dark' ? (
                  <SunIcon className="w-3.5 h-3.5" />
                ) : (
                  <MoonIcon className="w-3.5 h-3.5" />
                )}
                <span>{theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
              </button>
            </div>

            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Products</div>
              <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <li><button type="button" onClick={() => onNavigate('cloud-hosting')} className="hover:underline">Cloud Hosting</button></li>
                <li><button type="button" onClick={() => onNavigate('web-hosting')} className="hover:underline">Web Hosting</button></li>
                <li><button type="button" onClick={() => onNavigate('vps-hosting')} className="hover:underline">VPS Hosting</button></li>
                <li><button type="button" onClick={() => onNavigate('dedicated-servers')} className="hover:underline">Dedicated Servers</button></li>
                <li><button type="button" onClick={() => onNavigate('application-hosting')} className="hover:underline">Application Hosting</button></li>
              </ul>
            </div>

            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Platform</div>
              <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <li><button type="button" onClick={() => onNavigate('pricing')} className="hover:underline">Pricing</button></li>
                <li><button type="button" onClick={() => onNavigate('features')} className="hover:underline">Architecture</button></li>
                <li><button type="button" onClick={() => onNavigate('docs')} className="hover:underline">Documentation</button></li>
                <li><button type="button" onClick={() => onNavigate('support')} className="hover:underline">Support</button></li>
              </ul>
            </div>

            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Company</div>
              <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <li><button type="button" onClick={() => onNavigate('about')} className="hover:underline">About MCloud</button></li>
                <li><button type="button" onClick={() => onNavigate('contact')} className="hover:underline">Contact</button></li>
                <li><button type="button" onClick={() => onNavigate('privacy')} className="hover:underline">Privacy Policy</button></li>
              </ul>
            </div>

            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Account</div>
              <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <li><button type="button" onClick={() => onNavigate('register')} className="hover:underline">Create Account (Sign Up)</button></li>
                <li><button type="button" onClick={() => onNavigate('login')} className="hover:underline">Sign In</button></li>
                <li><button type="button" onClick={() => onEnterConsole()} className="hover:underline">Customer Console</button></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span>Copyright {new Date().getFullYear()} MCloud Infrastructure Platform.</span>
            <span>Worldwide compute zones with SHA-256 backup verification.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
