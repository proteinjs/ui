/**
 * jest globalSetup: pin the test zone to UTC+12 (no daylight saving) before any worker starts.
 *
 * Date tests must observe the local-day / UTC-day boundary; on a UTC machine (every CI runner)
 * the two coincide and a boundary bug is invisible. A fixed eastern zone keeps every date suite
 * deterministic across machines. Set here — in the parent process, before the workers fork and
 * inherit the environment — because a `process.env.TZ` assignment inside a test file lands on
 * the sandbox's copy of `process.env` and never reaches the runtime's zone.
 */
module.exports = async () => {
  process.env.TZ = 'Etc/GMT-12';
};
