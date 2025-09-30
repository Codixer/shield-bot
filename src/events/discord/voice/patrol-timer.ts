import { Discord, On } from "discordx";
import type { ArgsOf } from "discordx";
import { patrolTimer } from "../../../main.js";

@Discord()
export class PatrolTimerEvents {
  // Voice state listener
  @On({ event: "voiceStateUpdate" })
  async onVoice([oldState, newState]: ArgsOf<"voiceStateUpdate">) {
    await patrolTimer.handleVoiceStateUpdate(oldState, newState);
  }
}
