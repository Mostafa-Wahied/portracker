module.exports = {
  plugins: [
    require('@tailwindcss/postcss')({
      config: './tailwind.config.cjs',
    }),
    require('autoprefixer'),
  ],
};
