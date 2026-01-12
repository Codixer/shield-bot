import { Discord, SlashGroup } from "discordx";

@Discord()
// Root dev group definition
@SlashGroup({
  name: "dev",
  description: "Development and debugging commands (Bot Owner only)",
})
export class DevRootGroup {}
