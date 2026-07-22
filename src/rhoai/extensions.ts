// [SHARED] Common section for all community plugins — never changes across plugins.
// Do not change the id or name: all community plugins share this section
// so they appear grouped together in the dashboard sidebar.
export const communityPluginsSectionExtension = {
  type: 'app.navigation/section' as const,
  properties: {
    id: 'community-plugins', // [SHARED] common section for all community plugins
    title: 'Community plugins', // [SHARED]
    group: '9_plugins', // [SHARED]
    iconRef: () => import(/* webpackMode: "eager" */ './CommunityNavIcon'),
  },
};

// [PLUGIN-SPECIFIC] Everything below is specific to this plugin

export const guidellmBenchmarkerAreaExtension = {
  type: 'app.area' as const,
  properties: {
    id: 'guidellm-benchmarker',
    featureFlags: [] as string[],
  },
};

export const guidellmBenchmarkerSectionExtension = {
  type: 'app.navigation/section' as const,
  properties: {
    id: 'guidellm-benchmarker',
    title: 'GuideLLM Benchmarker',
    group: '1_guidellm_benchmarker',
    section: 'community-plugins',
    iconRef: () => import(/* webpackMode: "eager" */ '~/app/components/GuidellmBenchmarkerNavIcon'),
  },
};

export const runBenchmarkNavExtension = {
  type: 'app.navigation/href' as const,
  properties: {
    id: 'guidellm-benchmarker-run',
    title: 'Run Benchmark',
    href: '/guidellm-benchmarker/run',
    section: 'guidellm-benchmarker',
    path: '/guidellm-benchmarker/run/*',
  },
};

export const resultsNavExtension = {
  type: 'app.navigation/href' as const,
  properties: {
    id: 'guidellm-benchmarker-results',
    title: 'Results',
    href: '/guidellm-benchmarker/results',
    section: 'guidellm-benchmarker',
    path: '/guidellm-benchmarker/results/*',
  },
};

export const guidellmBenchmarkerRouteExtension = {
  type: 'app.route' as const,
  properties: {
    path: '/guidellm-benchmarker/*',
    component: () => import(/* webpackMode: "eager" */ '~/app/App'),
  },
};

export const extensions = [
  communityPluginsSectionExtension,
  guidellmBenchmarkerAreaExtension,
  guidellmBenchmarkerSectionExtension,
  runBenchmarkNavExtension,
  resultsNavExtension,
  guidellmBenchmarkerRouteExtension,
];

export default extensions;
