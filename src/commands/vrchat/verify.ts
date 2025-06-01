import { Discord, Slash, SlashOption, SlashGroup, Guild, Guard } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, MessageFlags, EmbedBuilder, Colors, AutocompleteInteraction, CategoryChannel, ChannelType, TextDisplayBuilder, ContainerBuilder, SectionBuilder, ButtonBuilder, ButtonStyle, MediaGalleryBuilder } from "discord.js";
import { config } from "dotenv";
import { VRChatLoginGuard } from "../../utility/guards.js";


config();

@Discord()

@SlashGroup({ name: "vrchat", description: "VRChat related commands." })
@SlashGroup("vrchat")
@Guard(VRChatLoginGuard)
export default class VRChatCommands {
    @Slash({
        name: "verify",
        description: "Start the verification process.",
    })
    async verify(interaction: CommandInteraction) {

    }

}
