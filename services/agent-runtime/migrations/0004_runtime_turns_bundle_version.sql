ALTER TABLE agent_runtime.runtime_turns
  ADD COLUMN IF NOT EXISTS bundle_version text;
