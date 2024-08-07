import React, { PureComponent } from "react";
import Operator from "./Operator";
import {Col} from "../utils";


export default class OperatorWrapper extends PureComponent {
  render() {
    const {
      config, selectedField, selectedFieldSrc, selectedFieldType, selectedOperator, setOperator, 
      selectedFieldId, showOperator, showOperatorLabel, selectedFieldWidgetConfig, readonly, id, groupId
    } = this.props;
    const operator = showOperator
            && <Col key={"operators-for-"+selectedFieldId} className="rule--operator">
              { config.settings.showLabels
                    && <label className="rule--label">{config.settings.operatorLabel}</label>
              }
              <Operator
                key="operator"
                config={config}
                selectedField={selectedField}
                selectedFieldSrc={selectedFieldSrc}
                selectedFieldType={selectedFieldType}
                selectedFieldId={selectedFieldId}
                selectedOperator={selectedOperator}
                setOperator={setOperator}
                customProps={config.settings.customOperatorSelectProps}
                readonly={readonly}
                id={id}
                groupId={groupId}
              />
            </Col>;
    const hiddenOperator = showOperatorLabel
            && <Col key={"operators-for-"+selectedFieldId} className="rule--operator">
              <div className="rule--operator-wrapper">
                {config.settings.showLabels
                  ? <label className="rule--label">&nbsp;</label>
                  : null}
                <div className="rule--operator-text-wrapper">
                  <span className="rule--operator-text">{selectedFieldWidgetConfig.operatorInlineLabel}</span>
                </div>
              </div>
            </Col>;
    return [
      operator,
      hiddenOperator
    ];
  }
}
