import * as React from "react";
import { connect } from 'react-redux';

import { SkillMapState } from '../store/reducer';
import { SkillGraph } from "./SkillGraph";
import { SvgGraph, getGraph, PADDING, UNIT, MIN_HEIGHT, MIN_WIDTH } from '../lib/skillGraphUtils';

/* eslint-disable import/no-unassigned-import, import/no-internal-modules */
import '../styles/skillgraph.css'
/* eslint-enable import/no-unassigned-import, import/no-internal-modules */

interface SkillGraphContainerProps {
    maps: SkillMap[];
    graphs: SvgGraph[];
    backgroundImageUrl: string;
    graphSize: {
        width: number;
        height: number;
    };
}

interface SkillGraphContainerState {
    backgroundSize: {
        width: number;
        height: number;
    };
}

const THRESHOLD = 0.05;

export class SkillGraphContainerImpl extends React.Component<SkillGraphContainerProps, SkillGraphContainerState> {
    constructor(props: SkillGraphContainerProps) {
        super(props);

        this.state = { backgroundSize: { width: 0, height: 0 } };
    }

    protected onImageLoad = (evt: any) => {
        this.setState({
            backgroundSize: {
                width: evt.target.naturalWidth,
                height: evt.target.naturalHeight
            }
        })
    }

    render() {
        const { graphs, graphSize, backgroundImageUrl } = this.props;
        const { backgroundSize } = this.state;
        let translateY = 0;

        const padding = PADDING * UNIT;
        const graphAspectRatio = graphSize.width / graphSize.height;
        const backgroundAspectRatio = backgroundSize.width / backgroundSize.height;

        let height = Math.max(MIN_HEIGHT, graphSize.height);
        let width = Math.max(MIN_WIDTH, graphSize.width);

        if (backgroundImageUrl) {
            // Scale the SVG to exactly fit the background image
            if (graphAspectRatio - backgroundAspectRatio > THRESHOLD) {
                height = width * (1 / backgroundAspectRatio);
            } else if (graphAspectRatio - backgroundAspectRatio < -THRESHOLD)  {
                width = height * backgroundAspectRatio;
            }
        }

        const heightDiff = Math.max(height - graphSize.height, 0) / 2;
        const widthDiff = Math.max(width - graphSize.width, 0) / 2;

        return <div className="skill-graph-wrapper">
            <div className={`skill-graph-content ${backgroundImageUrl ? "has-background" : ""}`}>
                <div className="skill-graph-activities">
                    <svg viewBox={`-${widthDiff + padding} -${heightDiff + padding} ${width + padding * 2} ${height + padding * 2}`} preserveAspectRatio="xMidYMid meet">
                        {graphs.map((el, i) => {
                            translateY += el.height;
                            return <g key={i} transform={`translate(0, ${translateY - el.height})`}>
                                <SkillGraph unit={UNIT} {...el} />
                            </g>
                        })}
                    </svg>
                </div>
                {backgroundImageUrl && <div className="skill-graph-background">
                    <img src={backgroundImageUrl} alt={lf("Background Image")} onLoad={this.onImageLoad} />
                </div>}
            </div>
        </div>
    }
}


function mapStateToProps(state: SkillMapState, ownProps: SkillGraphContainerProps) {
    if (!state) return {};

    // Compute graph layout, update size of skill map
    const graphs = ownProps.maps.map(el => getGraph(el));
    const width = graphs?.length ? graphs.map(el => el.width).reduce((prev, curr) => Math.max(prev, curr)) : 0;
    const height = graphs?.length ? graphs.map(el => el.height).reduce((prev, curr) => prev + curr) : 0;

    return {
        graphs,
        graphSize: { width, height }
    }
}

export const SkillGraphContainer = connect(mapStateToProps)(SkillGraphContainerImpl);