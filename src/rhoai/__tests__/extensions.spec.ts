import {
  guidellmBenchmarkerAreaExtension,
  communityPluginsSectionExtension,
  guidellmBenchmarkerSectionExtension,
  runBenchmarkNavExtension,
  resultsNavExtension,
  guidellmBenchmarkerRouteExtension,
  extensions,
} from '../extensions';

describe('RHOAI Plugin Extensions', () => {
  describe('guidellmBenchmarkerAreaExtension', () => {
    it('should have the correct type and id', () => {
      expect(guidellmBenchmarkerAreaExtension.type).toBe('app.area');
      expect(guidellmBenchmarkerAreaExtension.properties.id).toBe('guidellm-benchmarker');
    });

    it('should have an empty featureFlags array', () => {
      expect(guidellmBenchmarkerAreaExtension.properties.featureFlags).toEqual([]);
    });
  });

  describe('communityPluginsSectionExtension', () => {
    it('should define the community-plugins section', () => {
      expect(communityPluginsSectionExtension.type).toBe('app.navigation/section');
      expect(communityPluginsSectionExtension.properties.id).toBe('community-plugins');
      expect(communityPluginsSectionExtension.properties.title).toBe('Community plugins');
      expect(communityPluginsSectionExtension.properties.group).toBe('9_plugins');
    });

    it('should have an iconRef function', () => {
      expect(typeof communityPluginsSectionExtension.properties.iconRef).toBe('function');
    });
  });

  describe('guidellmBenchmarkerSectionExtension', () => {
    it('should define a subsection nested under community-plugins', () => {
      expect(guidellmBenchmarkerSectionExtension.type).toBe('app.navigation/section');
      expect(guidellmBenchmarkerSectionExtension.properties.id).toBe('guidellm-benchmarker');
      expect(guidellmBenchmarkerSectionExtension.properties.title).toBe('GuideLLM Benchmarker');
      expect(guidellmBenchmarkerSectionExtension.properties.group).toBe('1_guidellm_benchmarker');
      expect(guidellmBenchmarkerSectionExtension.properties.section).toBe('community-plugins');
      expect(typeof guidellmBenchmarkerSectionExtension.properties.iconRef).toBe('function');
    });
  });

  describe('navigation extensions', () => {
    it('should define Run Benchmark nav item', () => {
      expect(runBenchmarkNavExtension.type).toBe('app.navigation/href');
      expect(runBenchmarkNavExtension.properties.id).toBe('guidellm-benchmarker-run');
      expect(runBenchmarkNavExtension.properties.title).toBe('Run Benchmark');
      expect(runBenchmarkNavExtension.properties.href).toBe('/guidellm-benchmarker/run');
      expect(runBenchmarkNavExtension.properties.section).toBe('guidellm-benchmarker');
      expect(runBenchmarkNavExtension.properties.path).toBe('/guidellm-benchmarker/run/*');
    });

    it('should define Results nav item', () => {
      expect(resultsNavExtension.type).toBe('app.navigation/href');
      expect(resultsNavExtension.properties.id).toBe('guidellm-benchmarker-results');
      expect(resultsNavExtension.properties.title).toBe('Results');
      expect(resultsNavExtension.properties.href).toBe('/guidellm-benchmarker/results');
      expect(resultsNavExtension.properties.section).toBe('guidellm-benchmarker');
      expect(resultsNavExtension.properties.path).toBe('/guidellm-benchmarker/results/*');
    });
  });

  describe('route extension', () => {
    it('should define a single wildcard route with lazy component', () => {
      expect(guidellmBenchmarkerRouteExtension.type).toBe('app.route');
      expect(guidellmBenchmarkerRouteExtension.properties.path).toBe('/guidellm-benchmarker/*');
      expect(typeof guidellmBenchmarkerRouteExtension.properties.component).toBe('function');
      expect(guidellmBenchmarkerRouteExtension.properties.component()).toBeInstanceOf(Promise);
    });
  });

  describe('extensions array', () => {
    it('should contain all six extensions', () => {
      expect(extensions).toHaveLength(6);
    });

    it('should include all extensions in the correct order', () => {
      expect(extensions).toEqual([
        communityPluginsSectionExtension,
        guidellmBenchmarkerAreaExtension,
        guidellmBenchmarkerSectionExtension,
        runBenchmarkNavExtension,
        resultsNavExtension,
        guidellmBenchmarkerRouteExtension,
      ]);
    });
  });
});
