import { ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, ModalSubmitInteraction, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } from "discord.js";
import { Discord, ModalComponent } from "discordx";
import { searchUsers } from "../../../../utility/vrchat.js";

@Discord()
export class vrchatVerifyUsernameModal {
    @ModalComponent({ id: `vrchat-verify-username-modal` })
    async vrchatUsername(interaction: ModalSubmitInteraction): Promise<void> {
        if (!interaction.isFromMessage()) return;

        const username = interaction.fields.getTextInputValue("vrchat-username-input");
        let components = new ContainerBuilder();

        const users = await searchUsers({ search: username });
        if (users.length === 0) {
            components = components
                .setAccentColor(5763719)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent("### Verify your VRChat account | Step 1 - Username"),
                )
                .addSectionComponents(
                    new SectionBuilder()
                        .setButtonAccessory(
                            new ButtonBuilder()
                                .setStyle(ButtonStyle.Danger)
                                .setLabel("Username not found, try again.")
                                .setCustomId("vrchat-verify-username")
                        )
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent("Press the button to set the username you'd like to verify with:"),
                        ),
                )
        } else if (users.length === 1) {
            const user = users[0];
            components = components.setAccentColor(5763719)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent("### Verify your VRChat account | Step 1 - Username"),
                )
                .addSectionComponents(
                    new SectionBuilder()
                        .setButtonAccessory(
                            new ButtonBuilder()
                                .setStyle(ButtonStyle.Success)
                                .setLabel(user.displayName)
                                .setCustomId("vrchat-verify-username")
                        )
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent("Press the button to set the username you'd like to verify with:"),
                        ),
                )
        } else { 
            
        }





        await interaction.update({
            flags: MessageFlags.IsComponentsV2,
            components: [components],
        });
    }
}