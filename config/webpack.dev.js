const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const path = require('path');

module.exports = merge(common, {
  mode: 'development',
  devtool: 'eval-source-map',
  devServer: {
    port: parseInt(process.env.PORT, 10) || 9500, // [PLUGIN-SPECIFIC] dev port
    historyApiFallback: true,
    hot: true,
    proxy: [
      {
        context: ['/guidellm-benchmarker/api'], // [PLUGIN-SPECIFIC] BFF proxy — must come before the general proxy
        target: 'http://localhost:3000',
        pathRewrite: { '^/guidellm-benchmarker/api': '/api' },
      },
      {
        context: ['/guidellm-benchmarker'], // [PLUGIN-SPECIFIC] must match route prefix
        target: 'http://localhost:8443',
        pathRewrite: { '^/guidellm-benchmarker': '/guidellm-benchmarker' },
      },
    ],
  },
  optimization: {
    runtimeChunk: false,
    splitChunks: false,
  },
});
