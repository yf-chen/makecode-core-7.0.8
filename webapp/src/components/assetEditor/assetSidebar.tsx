import * as React from "react";
import * as pkg from "../../package";
import * as simulator from "../../simulator";
import * as sui from "../../sui";
import { connect } from 'react-redux';

import { AssetEditorState, GalleryView, isGalleryAsset } from './store/assetEditorReducer';
import { dispatchChangeGalleryView, dispatchChangeSelectedAsset, dispatchUpdateUserAssets } from './actions/dispatch';

import { AssetPreview } from "./assetPreview";
import { getBlocksEditor } from "../../app";

interface AssetDetail {
    name: string;
    value: string;
}

interface AssetSidebarProps {
    asset?: pxt.Asset;
    isGalleryAsset?: boolean;
    showAssetFieldView?: (asset: pxt.Asset, cb: (result: any) => void) => void;
    dispatchChangeGalleryView: (view: GalleryView, assetType?: pxt.AssetType, assetId?: string) => void;
    dispatchChangeSelectedAsset: (assetType?: pxt.AssetType, assetId?: string) => void;
    dispatchUpdateUserAssets: () => void;
}

interface AssetSidebarState {
    showDeleteModal: boolean;
    canEdit: boolean;
    canCopy: boolean;
    canDelete: boolean;
}

class AssetSidebarImpl extends React.Component<AssetSidebarProps, AssetSidebarState> {
    protected copyTextAreaRef: HTMLTextAreaElement;

    constructor(props: AssetSidebarProps) {
        super(props);
        this.state = { showDeleteModal: false, canEdit: true, canCopy: true, canDelete: true };
    }

    UNSAFE_componentWillReceiveProps(nextProps: AssetSidebarProps) {
        if (nextProps.asset && this.props.asset != nextProps.asset) {
            const { asset, isGalleryAsset } = nextProps;

            const project = pxt.react.getTilemapProject();
            const canEdit = !isGalleryAsset;
            const canCopy = asset?.type != pxt.AssetType.Tilemap && asset?.type != pxt.AssetType.Animation;
            const canDelete = !isGalleryAsset && !project.isAssetUsed(asset, pkg.mainEditorPkg().files);

            this.setState({ canEdit, canCopy, canDelete });
        }
    }

    protected getAssetDetails(): AssetDetail[] {
        const asset = this.props.asset;
        const details: AssetDetail[] = [];
        if (asset) {
            details.push({ name: lf("Type"), value: getDisplayTextForAsset(asset.type)});

            switch (asset.type) {
                case pxt.AssetType.Image:
                case pxt.AssetType.Tile:
                    details.push({ name: lf("Size"), value: `${asset.bitmap.width} x ${asset.bitmap.height}`});
                    break;
                case pxt.AssetType.Tilemap:
                    details.push({ name: lf("Size"), value: `${asset.data.tilemap.width} x ${asset.data.tilemap.height}`});
                    break;
                case pxt.AssetType.Animation:
                    details.push({ name: lf("Size"), value: `${asset.frames[0].width} x ${asset.frames[0].height}`});
                    break;
            }
        }

        return details;
    }

    protected updateAssets(): Promise<void> {
        return pkg.mainEditorPkg().buildAssetsAsync()
            .then(() => this.props.dispatchUpdateUserAssets());
    }

    protected editAssetHandler = () => {
        this.props.showAssetFieldView(this.props.asset, this.editAssetDoneHandler);
    }

    protected editAssetDoneHandler = (result: pxt.Asset) => {
        pxt.tickEvent("assets.edit", { type: result.type.toString() });

        const project = pxt.react.getTilemapProject();
        project.pushUndo();
        if (!result.meta.displayName && result.meta.temporaryInfo) {
            getBlocksEditor().updateTemporaryAsset(result);

            pkg.mainEditorPkg().lookupFile("this/main.blocks").setContentAsync(getBlocksEditor().getCurrentSource())

        }
        else {
            project.updateAsset(result);
        }
        this.props.dispatchChangeGalleryView(GalleryView.User);
        this.updateAssets().then(() => simulator.setDirty());
    }

    protected duplicateAssetHandler = () => {
        pxt.tickEvent("assets.duplicate", { type: this.props.asset.type.toString(), gallery: this.props.isGalleryAsset.toString() });

        const asset = this.props.asset;
        if (!asset.meta?.displayName) asset.meta = { ...asset.meta, displayName: getDisplayNameForAsset(asset, this.props.isGalleryAsset) }

        const project = pxt.react.getTilemapProject();
        project.pushUndo();
        const { type, id } = project.duplicateAsset(asset);
        this.updateAssets().then(() => {
            this.props.dispatchChangeGalleryView(GalleryView.User, type, id);
        });
    }

    protected copyAssetHandler = () => {
        const { asset } = this.props;
        pxt.tickEvent("assets.clipboard", { type: asset.type.toString(), gallery: this.props.isGalleryAsset.toString() });

        switch (asset.type) {
            case pxt.AssetType.Image:
            case pxt.AssetType.Tile:
                try {
                    const data = pxt.sprite.bitmapToImageLiteral(pxt.sprite.getBitmapFromJResURL(asset.jresData), "typescript");
                    this.copyTextAreaRef.value = data;
                    this.copyTextAreaRef.focus();
                    this.copyTextAreaRef.select();
                    document.execCommand("copy");
                } catch { }
                break;
            default:
                break;
        }
    }

    protected copyTextAreaRefHandler = (el: HTMLTextAreaElement) => { this.copyTextAreaRef = el }

    protected showDeleteModal = () => {
        this.setState({ showDeleteModal: true });
    }

    protected hideDeleteModal = () => {
        this.setState({ showDeleteModal: false });
    }

    protected deleteAssetHandler = () => {
        pxt.tickEvent("assets.delete", { type: this.props.asset.type.toString() });

        this.setState({ showDeleteModal: false });
        const project = pxt.react.getTilemapProject();
        project.pushUndo();
        project.removeAsset(this.props.asset);
        this.props.dispatchChangeSelectedAsset();
        this.updateAssets();
    }

    render() {
        const { asset, isGalleryAsset } = this.props;
        const { showDeleteModal, canEdit, canCopy, canDelete } = this.state;
        const details = this.getAssetDetails();
        const isNamed = asset?.meta?.displayName || isGalleryAsset;
        const name = getDisplayNameForAsset(asset, isGalleryAsset);

        const actions: sui.ModalButton[] = [{ label: lf("Delete"), onclick: this.deleteAssetHandler, icon: 'trash', className: 'red' }];

        return <div className="asset-editor-sidebar">
            <div className="asset-editor-sidebar-info">
                <div>{lf("Asset Preview")}</div>
                <div className="asset-editor-sidebar-preview">
                    { asset && <AssetPreview asset={asset} />  }
                </div>
                {isNamed || !asset
                    ? <div className="asset-editor-sidebar-name">{ name }</div>
                    : <div className="asset-editor-sidebar-temp">
                        <i className="icon exclamation triangle" />
                        <span>{lf("No asset name")}</span>
                    </div>
                }
                {details.map(el => {
                    return <div key={el.name} className="asset-editor-sidebar-detail">{`${el.name}: ${el.value}`}</div>
                })}
            </div>
            { asset && <div className="asset-editor-sidebar-controls">
                {canEdit && <sui.MenuItem name={lf("Edit")} className="asset-editor-button" icon="edit" onClick={this.editAssetHandler}/>}
                <sui.MenuItem name={lf("Duplicate")} className="asset-editor-button" icon="copy" onClick={this.duplicateAssetHandler}/>
                {canCopy && <sui.MenuItem name={lf("Copy")} className="asset-editor-button" icon="paste" onClick={this.copyAssetHandler}/>}
                {canDelete && <sui.MenuItem name={lf("Delete Asset")}
                    className="delete-asset"
                    dataTooltip={!canDelete ? (isGalleryAsset ? lf("Can't delete gallery item") : lf("Asset is used in your project")) : undefined}
                    onClick={canDelete ? this.showDeleteModal : undefined}/>}
            </div>}
            <textarea className="asset-editor-sidebar-copy" ref={this.copyTextAreaRefHandler} ></textarea>
            <sui.Modal className="asset-editor-delete-dialog" isOpen={showDeleteModal} onClose={this.hideDeleteModal} closeIcon={true} dimmer={true} header={lf("Delete Asset")} buttons={actions}>
                <div>{lf("Are you sure you want to delete {0}? Deleted assets cannot be recovered.", name)}</div>
            </sui.Modal>
        </div>
    }
}

function getDisplayTextForAsset(type: pxt.AssetType) {
    switch (type) {
        case pxt.AssetType.Image:
            return lf("Image");
        case pxt.AssetType.Tile:
            return lf("Tile");
        case pxt.AssetType.Animation:
            return lf("Animation");
        case pxt.AssetType.Tilemap:
            return lf("Tilemap");
    }
}

function getDisplayNameForAsset(asset: pxt.Asset, isGalleryAsset?: boolean) {
    if (!asset) {
        return lf("No asset selected");
    } else if (asset?.meta?.displayName) {
        return asset.meta.displayName;
    } else {
        return isGalleryAsset ? asset.id.split('.').pop() : lf("Temporary asset");
    }
}

function mapStateToProps(state: AssetEditorState, ownProps: any) {
    if (!state) return {};
    return {
        asset: state.selectedAsset,
        isGalleryAsset: isGalleryAsset(state.selectedAsset)
    };
}

const mapDispatchToProps = {
    dispatchChangeGalleryView,
    dispatchChangeSelectedAsset,
    dispatchUpdateUserAssets
};

export const AssetSidebar = connect(mapStateToProps, mapDispatchToProps)(AssetSidebarImpl);
