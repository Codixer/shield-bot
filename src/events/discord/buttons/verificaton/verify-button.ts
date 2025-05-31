import { Discord, ButtonComponent, } from "discordx";
import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ContainerBuilder, MessageFlags, ModalBuilder, SectionBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle, } from "discord.js";

@Discord()
export class VerificationButton {
    @ButtonComponent({ id: "vrchat-verify" })
    async verify(interaction: ButtonInteraction): Promise<void> {
        const components = 
            new ContainerBuilder()
            .setAccentColor(5763719)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent("### Verify your VRChat account | Step 1 - Username"),
            )
            .addSectionComponents(
                new SectionBuilder()
                    .setButtonAccessory(
                        new ButtonBuilder()
                            .setStyle(ButtonStyle.Secondary)
                            .setLabel("Username")
                            .setCustomId("vrchat-verify-username")
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent("Press the button to set the username you'd like to verify with:"),
                    ),
            )

        // Update the interaction with the new components
        await interaction.update({
            flags: MessageFlags.IsComponentsV2,
            components: [components],
        });
    }

    @ButtonComponent({ id: "vrchat-verify-username" })
    async verifyUsername(interaction: ButtonInteraction): Promise<void> {



        const username = new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder()
            .setCustomId("vrchat-username-input")
            .setLabel("Username")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Enter your VRChat username here")
            .setRequired(true));




        const modalBuilder = new ModalBuilder()
            .setCustomId("vrchat-verify-username-modal")
            .setTitle("Enter Username")
            .addComponents(
                username
            );


        interaction.showModal(modalBuilder);
    }

}
