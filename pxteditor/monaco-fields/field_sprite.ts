/// <reference path="./monacoFieldEditor.ts" />
/// <reference path="./field_react.ts" />

namespace pxt.editor {
    const fieldEditorId = "image-editor";

    export class MonacoSpriteEditor extends MonacoReactFieldEditor<pxt.ProjectImage> {
        protected isPython: boolean;
        protected isAsset: boolean;

        protected textToValue(text: string): pxt.ProjectImage {
            this.isPython = text.indexOf("`") === -1

            const match = pxt.parseAssetTSReference(text);
            if (match) {
                const { type, name: matchedName } = match;
                const name = matchedName.trim();
                const project = pxt.react.getTilemapProject();
                this.isAsset = true;
                const asset = project.lookupAssetByName(pxt.AssetType.Image, name);
                if (asset) {
                    return asset;
                }
                else {
                    const newAsset = project.createNewImage();

                    if (name && !project.isNameTaken(pxt.AssetType.Image, name) && pxt.validateAssetName(name)) {
                        newAsset.meta.displayName = name;
                    }

                    return newAsset;
                }
            }

            return createFakeAsset(pxt.sprite.imageLiteralToBitmap(text));
        }

        protected resultToText(result: pxt.ProjectImage): string {
            if (result.meta?.displayName) {
                const project = pxt.react.getTilemapProject();
                if (this.isAsset) {
                    result = project.updateAsset(result)
                } else {
                    this.isAsset = true;
                    result = project.createNewProjectImage(result.bitmap, result.meta.displayName);
                }
                return pxt.getTSReferenceForAsset(result, this.isPython);
            }
            return pxt.sprite.bitmapToImageLiteral(pxt.sprite.Bitmap.fromData(result.bitmap), this.isPython ? "python" : "typescript");
        }

        protected getFieldEditorId() {
            return "image-editor";
        }
        protected getOptions(): any {
            return {
                initWidth: 16,
                initHeight: 16,
                blocksInfo: this.host.blocksInfo()
            };
        }
    }

    function createFakeAsset(bitmap: pxt.sprite.Bitmap): pxt.ProjectImage {
        return {
            type: pxt.AssetType.Image,
            id: "",
            internalID: 0,
            bitmap: bitmap.data(),
            meta: {},
            jresData: ""
        }
    }

    export const spriteEditorDefinition: MonacoFieldEditorDefinition = {
        id: fieldEditorId,
        foldMatches: true,
        glyphCssClass: "sprite-editor-glyph sprite-focus-hover",
        heightInPixels: 510,
        matcher: {
            // match both JS and python
            searchString: "(?:img|assets\\s*\\.\\s*image)\\s*(?:`|\\(\\s*\"\"\")(?:[^\"`]|\\n)*\\s*(?:`|\"\"\"\\s*\\))",
            isRegex: true,
            matchCase: true,
            matchWholeWord: false
        },
        proto: MonacoSpriteEditor
    };

    registerMonacoFieldEditor(fieldEditorId, spriteEditorDefinition);
}