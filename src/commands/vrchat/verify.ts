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
        const components = 
            new ContainerBuilder()
            .setAccentColor(5763719)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent("### Verify your VRChat account"),
            )
            .addSectionComponents(
                new SectionBuilder()
                    .setButtonAccessory(
                        new ButtonBuilder()
                            .setStyle(ButtonStyle.Primary)
                            .setLabel("Verify")
                            .setEmoji("✅")
                            .setCustomId("vrchat-verify")
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent("Press the button to start the verification process:"),
                    ),
            )

        interaction.reply({
            flags: MessageFlags.IsComponentsV2,
            components: [components]
        })

    }

}
