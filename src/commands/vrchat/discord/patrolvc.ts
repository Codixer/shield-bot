import { Discord, Slash, SlashOption, SlashGroup, Guild, Guard } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, MessageFlags, EmbedBuilder, Colors, AutocompleteInteraction, CategoryChannel, ChannelType, TextDisplayBuilder, ContainerBuilder, SectionBuilder, ButtonBuilder, ButtonStyle, MediaGalleryBuilder } from "discord.js";

@Discord()
export default class VRChatCommands {
    @Slash({
        name: "patrolvc",
        description: "Patrol VC",
    })
    async patrolvc(interaction: CommandInteraction) {
        // to be made

        interaction.reply({
            flags: MessageFlags.IsComponentsV2,
        })

    }

}
