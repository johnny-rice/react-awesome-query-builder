import Immutable, { fromJS } from "immutable";
import {
  expandTreePath, expandTreeSubpath, getItemByPath, getAncestorRuleGroups, fixPathsInTree,
  getTotalRulesCountInTree, fixEmptyGroupsInTree, isEmptyTree, hasChildren, removeIsLockedInTree
} from "../utils/treeUtils";
import {
  defaultRuleProperties, defaultGroupProperties, getDefaultOperator, 
  defaultOperatorOptions, defaultItemProperties,
} from "../utils/defaultRuleUtils";
import * as constants from "./constants";
import uuid from "../utils/uuid";
import {
  getFuncConfig, getFieldConfig, getOperatorConfig, selectTypes, getOperatorsForType, getOperatorsForField, getFirstOperator,
} from "../utils/configUtils";
import {
  isEmptyItem, calculateValueType
} from "../utils/ruleUtils";
import {deepEqual, getOpCardinality, applyToJS} from "../utils/stuff";
import {validateValue, validateRange} from "../utils/validation";
import {getNewValueForFieldOp} from "../utils/getNewValueForFieldOp";
import {translateValidation} from "../i18n";
import omit from "lodash/omit";
import mapValues from "lodash/mapValues";
import {setFunc, setArgValue, setArgValueSrc, setArgValueAsyncListValues} from "../utils/funcUtils";


/**
 * @param {object} config
 * @param {Immutable.List} path
 * @param {Immutable.Map} properties
 */
const addNewGroup = (state, path, type, generatedId, properties, config, children = null, meta = {}) => {
  const targetItem = state.getIn(expandTreePath(path));
  if (!targetItem) {
    // incorrect path
    return state;
  }

  const groupUuid = properties?.get?.("id") || generatedId;
  const {shouldCreateEmptyGroup} = config.settings;
  const groupPath = path.push(groupUuid);
  const canAddNewRule = !shouldCreateEmptyGroup;
  const isDefaultCase = !!meta?.isDefaultCase;

  const origState = state;
  state = addItem(state, path, type, groupUuid, defaultGroupProperties(config).merge(fromJS(properties) || {}), config, children);
  if (state !== origState) {
    if (!children && !isDefaultCase) {
      state = state.setIn(expandTreePath(groupPath, "children1"), new Immutable.OrderedMap());

      // Add one empty rule into new group
      if (canAddNewRule) {
        state = addItem(state, groupPath, "rule", uuid(), defaultRuleProperties(config, meta?.parentRuleGroupField), config);
      }
    }

    state = fixPathsInTree(state);
  }
  
  return state;
};

/**
 * @param {object} config
 * @param {Immutable.List} path
 * @param {Immutable.Map} properties
 */
const removeGroup = (state, path, config) => {
  const targetItem = state.getIn(expandTreePath(path));
  if (!targetItem) {
    // incorrect path
    return state;
  }
  
  state = removeItem(state, path);

  const {canLeaveEmptyGroup} = config.settings;
  const parentPath = path.slice(0, -1);
  const isEmptyParentGroup = !hasChildren(state, parentPath);
  if (isEmptyParentGroup && !canLeaveEmptyGroup) {
    // check ancestors for emptiness (and delete 'em if empty)
    state = fixEmptyGroupsInTree(state);
    
    if (isEmptyTree(state) && !canLeaveEmptyGroup) {
      // if whole query is empty, add one empty(!) rule to root
      const canUseDefaultFieldAndOp = false;
      const canGetFirst = false;
      state = addItem(
        state, new Immutable.List(), "rule", uuid(), 
        defaultRuleProperties(config, undefined, undefined, canUseDefaultFieldAndOp, canGetFirst), 
        config
      );
    }
  }
  state = fixPathsInTree(state);
  return state;
};

/**
 * @param {object} config
 * @param {Immutable.List} path
 */
const removeRule = (state, path, config) => {
  const targetItem = state.getIn(expandTreePath(path));
  if (!targetItem) {
    // incorrect path
    return state;
  }

  state = removeItem(state, path);

  const {canLeaveEmptyGroup} = config.settings;
  const parentPath = path.pop();
  const parent = state.getIn(expandTreePath(parentPath));

  const parentField = parent.getIn(["properties", "field"]);
  const parentOperator = parent.getIn(["properties", "operator"]);
  // const parentValue = parent.getIn(["properties", "value", 0]);
  const parentFieldConfig = parentField ? getFieldConfig(config, parentField) : null;
  const parentOperatorConfig = parentOperator ? getOperatorConfig(config, parentOperator, parentField) : null;
  const hasGroupCountRule = parentField && parentOperator && parentOperatorConfig.cardinality != 0; // && parentValue != undefined;
  
  const isParentRuleGroup = parent.get("type") == "rule_group";
  const isEmptyParentGroup = !hasChildren(state, parentPath);
  const canLeaveEmpty = isParentRuleGroup 
    ? hasGroupCountRule && parentFieldConfig.initialEmptyWhere
    : canLeaveEmptyGroup;
  
  if (isEmptyParentGroup && !canLeaveEmpty) {
    if (isParentRuleGroup) {
      // deleted last rule from rule_group, so delete whole rule_group
      state = state.deleteIn(expandTreePath(parentPath));
    }

    // check ancestors for emptiness (and delete 'em if empty)
    state = fixEmptyGroupsInTree(state);

    if (isEmptyTree(state) && !canLeaveEmptyGroup) {
      // if whole query is empty, add one empty(!) rule to root
      const canUseDefaultFieldAndOp = false;
      const canGetFirst = false;
      state = addItem(
        state, new Immutable.List(), "rule", uuid(), 
        defaultRuleProperties(config, undefined, undefined, canUseDefaultFieldAndOp, canGetFirst), 
        config
      );
    }
  }
  state = fixPathsInTree(state);
  return state;
};

/**
 * @param {Immutable.Map} state
 * @param {Immutable.List} path
 * @param {bool} not
 */
const setNot = (state, path, not) => {
  const targetItem = state.getIn(expandTreePath(path));
  if (!targetItem) {
    // incorrect path
    return state;
  }
  state = state.setIn(expandTreePath(path, "properties", "not"), not);
  return state;
};

/**
 * @param {Immutable.Map} state
 * @param {Immutable.List} path
 * @param {bool} lock
 */
const setLock = (state, path, lock) => {
  const targetItem = state.getIn(expandTreePath(path));
  if (!targetItem) {
    // incorrect path
    return state;
  }
  state = removeIsLockedInTree(state.setIn(expandTreePath(path, "properties", "isLocked"), lock));
  return state;
};

/**
 * @param {Immutable.Map} state
 * @param {Immutable.List} path
 * @param {string} conjunction
 */
const setConjunction = (state, path, conjunction) => {
  const targetItem = state.getIn(expandTreePath(path));
  if (!targetItem) {
    // incorrect path
    return state;
  }
  state = state.setIn(expandTreePath(path, "properties", "conjunction"), conjunction);
  return state;
};


/**
 * @param {Immutable.Map} state
 * @param {Immutable.List} path
 * @param {string} type
 * @param {string} id
 * @param {Immutable.OrderedMap} properties
 * @param {object} config
 */
const addItem = (state, path, type, generatedId, properties, config, children = null) => {
  if (type === "switch_group")
    throw new Error("Can't add switch_group programmatically");
  const targetItem = state.getIn(expandTreePath(path));
  if (!targetItem) {
    // incorrect path
    return state;
  }
  const id = properties?.get?.("id") || generatedId;
  const { maxNumberOfCases, maxNumberOfRules, maxNesting } = config.settings;
  const rootType = state.get("type");
  const isTernary = rootType === "switch_group";
  const caseGroup = isTernary ? state.getIn(expandTreePath(path.take(2))) : null;
  const childrenPath = expandTreePath(path, "children1");
  const targetChildren = state.getIn(childrenPath);
  const hasChildren = !!targetChildren && targetChildren.size;
  const targetChildrenSize = hasChildren ? targetChildren.size : null;
  let currentNumber, maxNumber;
  if (type === "case_group") {
    currentNumber = targetChildrenSize;
    maxNumber = maxNumberOfCases;
  } else if (type === "group") {
    const ruleGroups = getAncestorRuleGroups(state, path);
    if (ruleGroups.length) {
      // closest rule-group
      const { path: ruleGroupPath, field: ruleGroupField } = ruleGroups[0];
      const ruleGroupFieldConfig = getFieldConfig(config, ruleGroupField);
      currentNumber = path.size - ruleGroupPath.length;
      maxNumber = ruleGroupFieldConfig?.maxNesting;
    } else {
      currentNumber = path.size;
      maxNumber = maxNesting;
    }
  } else { // rule or rule_group
    const ruleGroups = getAncestorRuleGroups(state, path);
    if (ruleGroups.length) {
      // closest rule-group
      const { path: ruleGroupPath, field: ruleGroupField } = ruleGroups[0];
      const ruleGroupFieldConfig = getFieldConfig(config, ruleGroupField);
      const ruleGroupItem = getItemByPath(state, ruleGroupPath);
      maxNumber = ruleGroupFieldConfig?.maxNumberOfRules;
      currentNumber = getTotalRulesCountInTree(ruleGroupItem);
    } else {
      currentNumber = isTernary ? getTotalRulesCountInTree(caseGroup) : getTotalRulesCountInTree(state);
      maxNumber = maxNumberOfRules;
    }
  }
  const canAdd = maxNumber && currentNumber ? (currentNumber < maxNumber) : true;
  
  const item = {type, id, properties};
  _addChildren1(config, item, children);

  const isLastDefaultCase = type === "case_group" && hasChildren && targetChildren.last().get("children1") == null;

  if (canAdd) {
    const newChildren = new Immutable.OrderedMap({
      [id]: new Immutable.Map(item)
    });
    if (!hasChildren) {
      state = state.setIn(childrenPath, newChildren);
    } else if (isLastDefaultCase) {
      const last = targetChildren.last();
      const newChildrenWithLast = new Immutable.OrderedMap({
        [id]: new Immutable.Map(item),
        [last.get("id")]: last
      });
      state = state.deleteIn(expandTreePath(childrenPath, "children1", last.get("id")));
      state = state.mergeIn(childrenPath, newChildrenWithLast);
    } else {
      state = state.mergeIn(childrenPath, newChildren);
    }
    state = fixPathsInTree(state);
  }
  return state;
};

/**
 * @param {Immutable.Map} state
 * @param {Immutable.List} path
 */
const removeItem = (state, path) => {
  state = state.deleteIn(expandTreePath(path));
  state = fixPathsInTree(state);
  return state;
};

/**
 * @param {Immutable.Map} state
 * @param {Immutable.List} fromPath
 * @param {Immutable.List} toPath
 * @param {string} placement, see constants PLACEMENT_*: PLACEMENT_AFTER, PLACEMENT_BEFORE, PLACEMENT_APPEND, PLACEMENT_PREPEND
 * @param {object} config
 */
const moveItem = (state, fromPath, toPath, placement, config) => {
  const from = getItemByPath(state, fromPath);
  const sourcePath = fromPath.pop();
  const source = fromPath.size > 1 ? getItemByPath(state, sourcePath) : null;
  const sourceChildren = source ? source.get("children1") : null;

  const to = getItemByPath(state, toPath);
  const targetPath = (placement == constants.PLACEMENT_APPEND || placement == constants.PLACEMENT_PREPEND) ? toPath : toPath.pop();
  const target = (placement == constants.PLACEMENT_APPEND || placement == constants.PLACEMENT_PREPEND) 
    ? to
    : toPath.size > 1 ? getItemByPath(state, targetPath) : null;
  const targetChildren = target ? target.get("children1") : null;

  if (!source || !target || !from) {
    // incorrect path
    return state;
  }

  const isSameParent = (source.get("id") == target.get("id"));
  const isSourceInsideTarget = targetPath.size < sourcePath.size 
        && deepEqual(targetPath.toArray(), sourcePath.toArray().slice(0, targetPath.size));
  const isTargetInsideSource = targetPath.size > sourcePath.size 
        && deepEqual(sourcePath.toArray(), targetPath.toArray().slice(0, sourcePath.size));
  let sourceSubpathFromTarget = null;
  let targetSubpathFromSource = null;
  if (isSourceInsideTarget) {
    sourceSubpathFromTarget = Immutable.List(sourcePath.toArray().slice(targetPath.size));
  } else if (isTargetInsideSource) {
    targetSubpathFromSource = Immutable.List(targetPath.toArray().slice(sourcePath.size));
  }

  let newTargetChildren = targetChildren, newSourceChildren = sourceChildren;
  if (!isTargetInsideSource)
    newSourceChildren = newSourceChildren.delete(from.get("id"));
  if (isSameParent) {
    newTargetChildren = newSourceChildren;
  } else if (isSourceInsideTarget) {
    newTargetChildren = newTargetChildren.updateIn(expandTreeSubpath(sourceSubpathFromTarget, "children1"), (_oldChildren) => newSourceChildren);
  }

  if (placement == constants.PLACEMENT_BEFORE || placement == constants.PLACEMENT_AFTER) {
    newTargetChildren = Immutable.OrderedMap().withMutations(r => {
      for (let [itemId, item] of newTargetChildren.entries()) {
        if (itemId == to?.get("id") && placement == constants.PLACEMENT_BEFORE) {
          r.set(from.get("id"), from);
        }
                
        r.set(itemId, item);

        if (itemId == to?.get("id") && placement == constants.PLACEMENT_AFTER) {
          r.set(from.get("id"), from);
        }
      }
    });
  } else if (placement == constants.PLACEMENT_APPEND) {
    newTargetChildren = newTargetChildren.merge(Immutable.OrderedMap({[from.get("id")]: from}));
  } else if (placement == constants.PLACEMENT_PREPEND) {
    newTargetChildren = Immutable.OrderedMap({[from.get("id")]: from}).merge(newTargetChildren);
  }

  if (isTargetInsideSource) {
    newSourceChildren = newSourceChildren.updateIn(expandTreeSubpath(targetSubpathFromSource, "children1"), (_oldChildren) => newTargetChildren);
    newSourceChildren = newSourceChildren.delete(from.get("id"));
  }

  if (!isSameParent && !isSourceInsideTarget)
    state = state.updateIn(expandTreePath(sourcePath, "children1"), (_oldChildren) => newSourceChildren);
  if (!isTargetInsideSource)
    state = state.updateIn(expandTreePath(targetPath, "children1"), (_oldChildren) => newTargetChildren);

  state = fixPathsInTree(state);
  return state;
};

/**
 * @param {Immutable.Map} state
 * @param {Immutable.List} path
 * @param {integer} delta
 * @param {string} srcKey
 */
const setFieldSrc = (state, path, srcKey, config) => {
  const currentRule = state.getIn(expandTreePath(path));
  if (!currentRule) {
    // incorrect path
    return state;
  }

  const {keepInputOnChangeFieldSrc} = config.settings;
  const currentProperties = currentRule.get("properties");
  const currentField = currentProperties?.get("field");
  const currentFielType = currentProperties?.get("fieldType");
  const currentFieldConfig = getFieldConfig(config, currentField);
  // const currentType = currentRule.get("type");
  // const currentFieldSrc = currentProperties?.get("fieldSrc");

  // get fieldType for "memory effect"
  let fieldType = currentFieldConfig?.type || currentFielType;
  if (!fieldType || fieldType === "!group" || fieldType === "!struct") {
    fieldType = null;
  }
  const canReuseValue = !selectTypes.includes(fieldType);
  const keepInput = keepInputOnChangeFieldSrc && !isEmptyItem(currentRule, config) && canReuseValue;

  if (!keepInput) {
    // clear ALL properties
    state = state.setIn(
      expandTreePath(path, "properties"),
      defaultRuleProperties(config, null, null, false)
    );
  } else {
    // clear non-relevant properties
    state = state.setIn(expandTreePath(path, "properties", "field"), null);
    state = state.deleteIn(expandTreePath(path, "properties", "fieldError"));
    // set fieldType for "memory effect"
    state = state.setIn(expandTreePath(path, "properties", "fieldType"), fieldType);
  }

  // set fieldSrc
  state = state.setIn(expandTreePath(path, "properties", "fieldSrc"), srcKey);

  return state;
};

/**
 * @param {Immutable.Map} state
 * @param {Immutable.List} path
 * @param {integer} delta
 * @param {Array} parentFuncs
 * @param {string | null} argKey
 * @param {*} argValue if argKey is null, it's new func key
 * @param {string | "!valueSrc"} valueType
 * @param {*} asyncListValues
 */
const setFuncValue = (config, state, path, delta, parentFuncs, argKey, argValue, valueType, asyncListValues, _meta = {}) => {
  const currentRule = state.getIn(expandTreePath(path));
  if (!currentRule) {
    // incorrect path
    return state;
  }
  const isLHS = delta === -1;
  const currentProperties = currentRule.get("properties");
  const currentField = currentProperties.get("field");
  const currentValue = currentProperties.get("value");
  const currentV = isLHS ? currentField : currentValue.getIn([delta]);

  // go inwards
  let funcsPath = [];
  let targetFV = currentV;
  for (const [funcK, argK] of parentFuncs || []) {
    funcsPath.push([funcK, argK, targetFV]);
    if (funcK !== targetFV.get("func")) {
      const funcPath = funcsPath.map(([f, a]) => `${f}(${a})`).join("/") || "root";
      throw new Error(
        `In ${isLHS ? "LHS" : "RHS"} for path ${funcPath} expected func key ${funcK} but got ${targetFV.get("func")}`
      );
    }
    targetFV = targetFV.getIn(["args", argK, "value"]);
  }

  // modify
  if (!argKey) {
    const newFuncKey = argValue;
    const canFixArgs = true; // try to fix args to fit new func validations, otherwise - drop invalid args
    targetFV = setFunc(targetFV, newFuncKey, config, canFixArgs);
    // allow drop invalid args / reset to default, but don't trigger error if some arg is required
    // (not same as setting isEndValue = true)
    _meta.canDropArgs = true;
  } else {
    const funcKey = targetFV.get("func");
    const funcDefinition = getFuncConfig(config, funcKey);
    const {args} = funcDefinition;
    const argDefinition = args[argKey];

    if (valueType === "!valueSrc") {
      targetFV = setArgValueSrc(targetFV, argKey, argValue, argDefinition, config);
    } else {
      targetFV = setArgValue(targetFV, argKey, argValue, argDefinition, config);
      if (asyncListValues) {
        targetFV = setArgValueAsyncListValues(targetFV, argKey, asyncListValues, argDefinition, config);
      }
    }
  }

  // go outwards
  let newV = targetFV;
  while (funcsPath.length) {
    const [funcK, argK, parentFV] = funcsPath.pop();
    const funcDefinition = getFuncConfig(config, funcK);
    const {args} = funcDefinition;
    const argDefinition = args[argK];
    newV = setArgValue(parentFV, argK, newV, argDefinition, config);
  }

  if (isLHS) {
    return setField(state, path, newV, config, undefined, _meta);
  } else {
    return setValue(state, path, delta, newV, undefined, config, undefined, _meta);
  }
};

/**
 * @param {Immutable.Map} state
 * @param {Immutable.List} path
 * @param {string | Immutable.OrderedMap} newField
 */
const setField = (state, path, newField, config, asyncListValues, _meta = {}) => {
  const currentRule = state.getIn(expandTreePath(path));
  if (!currentRule) {
    // incorrect path
    return {state};
  }
  const { isEndValue, canDropArgs } = _meta;
  if (!newField) {
    state = removeItem(state, path);
    return {state};
  }

  const {fieldSeparator, setOpOnChangeField, showErrorMessage} = config.settings;
  if (Array.isArray(newField))
    newField = newField.join(fieldSeparator);

  const currentType = currentRule.get("type");
  const currentProperties = currentRule.get("properties");
  const wasRuleGroup = currentType == "rule_group";
  const currentFieldSrc = currentProperties?.get("fieldSrc");
  // const currentFieldError = currentProperties?.get("fieldError");
  const newFieldConfig = getFieldConfig(config, newField);
  if (!newFieldConfig) {
    console.warn(`No config for LHS ${newField}`);
    return {state};
  }
  let fieldType = newFieldConfig.type;
  if (fieldType === "!group" || fieldType === "!struct") {
    fieldType = null;
  }

  const currentOperator = currentProperties?.get("operator");
  const currentOperatorOptions = currentProperties?.get("operatorOptions");
  const currentField = currentProperties?.get("field");
  // const currentValue = currentProperties?.get("value");
  // const currentValueErrorStr = currentProperties?.get("valueError")?.join?.("|");
  // const _currentValueSrc = currentProperties?.get("valueSrc", new Immutable.List());
  // const _currentValueType = currentProperties?.get("valueType", new Immutable.List());

  const isRuleGroup = newFieldConfig.type == "!group";
  const isRuleGroupExt = isRuleGroup && newFieldConfig.mode == "array";
  const isChangeToAnotherType = wasRuleGroup != isRuleGroup;
  // const wasOkWithoutField = !currentField && currentFieldSrc && currentOperator;

  // If the newly selected field supports the same operator the rule currently
  // uses, keep it selected.
  const lastOp = newFieldConfig && newFieldConfig.operators?.indexOf(currentOperator) !== -1 ? currentOperator : null;
  const isSameFunc = currentFieldSrc === "func" && currentField?.get?.("func") === newField?.get?.("func");
  const forceKeepOp = isSameFunc && !!lastOp;
  let newOperator = null;
  const availOps = currentFieldSrc === "func" 
    ? getOperatorsForType(config, fieldType)
    : getOperatorsForField(config, newField);
  if (availOps && availOps.length == 1)
    newOperator = availOps[0];
  else if (forceKeepOp)
    newOperator = lastOp;
  else if (availOps && availOps.length > 1) {
    for (let strategy of setOpOnChangeField) {
      if (strategy == "keep" && !isChangeToAnotherType)
        newOperator = lastOp;
      else if (strategy == "default")
        newOperator = getDefaultOperator(config, newField, false);
      else if (strategy == "first")
        newOperator = getFirstOperator(config, newField);
      if (newOperator) //found op for strategy
        break;
    }
  }

  if (!isRuleGroup && !newFieldConfig.operators) {
    console.warn(`Type ${newFieldConfig.type} is not supported`);
    return {state};
  }

  if (wasRuleGroup && !isRuleGroup) {
    state = state.setIn(expandTreePath(path, "type"), "rule");
    state = state.deleteIn(expandTreePath(path, "children1"));
    state = state.setIn(expandTreePath(path, "properties"), new Immutable.OrderedMap());
  }

  if (!currentProperties) {
    state = state.setIn(expandTreePath(path, "properties"), new Immutable.OrderedMap());
  }

  const canFix = !showErrorMessage;
  if (isRuleGroup) {
    state = state.setIn(expandTreePath(path, "type"), "rule_group");
    const {canReuseValue, newValue, newValueSrc, newValueType, operatorCardinality} = getNewValueForFieldOp(
      { validateValue, validateRange },
      config, config, currentProperties, newField, newOperator, "field", canFix, isEndValue, canDropArgs
    );
    let groupProperties = defaultGroupProperties(config, newFieldConfig, newField).merge({
      field: newField,
      fieldSrc: "field",
      mode: newFieldConfig.mode,
    });
    if (isRuleGroupExt) {
      groupProperties = groupProperties.merge({
        operator: newOperator,
        value: newValue,
        valueSrc: newValueSrc,
        valueType: newValueType,
      });
    }
    state = state.setIn(expandTreePath(path, "children1"), new Immutable.OrderedMap());
    state = state.setIn(expandTreePath(path, "properties"), groupProperties);
    if (newFieldConfig.initialEmptyWhere && operatorCardinality == 1) { // just `COUNT(grp) > 1` without `HAVING ..`
      // no children
    } else {
      state = addItem(state, path, "rule", uuid(), defaultRuleProperties(config, newField), config);
    }
    state = fixPathsInTree(state);
  } else {
    state = state.updateIn(expandTreePath(path, "properties"), (map) => map.withMutations((current) => {
      const {
        canReuseValue, newValue, newValueSrc, newValueType, newValueError, newFieldError, fixedField
      } = getNewValueForFieldOp(
        { validateValue, validateRange },
        config, config, current, newField, newOperator, "field", canFix, isEndValue, canDropArgs
      );
      // const newValueErrorStr = newValueError?.join?.("|");
      let newCorrectField = newField;
      const willFixField = (fixedField !== newField);
      if (willFixField) {
        newCorrectField = fixedField;
      }
      // tip: `newCorrectField` is SAFE to set: even if it can't be fixed, it is reverted to previous good field.
      //      Unlike logic in `setValue()` action where we need to calc `canUpdValue`
      // const didFieldErrorChanged = showErrorMessage ? currentFieldError != newFieldError : !!currentFieldError != !!newFieldError;
      // const didValueErrorChanged = showErrorMessage ? currentValueErrorStr != newValueErrorStr : !!currentValueErrorStr != !!newValueErrorStr;
      // const didErrorChanged = didFieldErrorChanged || didValueErrorChanged;
      // isInternalValueChange = !didErrorChanged && !willFixField;
      if (showErrorMessage) {
        current = current.set("fieldError", newFieldError);
        current = current.set("valueError", newValueError);
      }
      const newOperatorOptions = canReuseValue ? currentOperatorOptions : defaultOperatorOptions(config, newOperator, newCorrectField);
      current = current
        .set("field", newCorrectField)
        .delete("fieldType") // remove "memory effect"
        .set("fieldSrc", currentFieldSrc)
        .set("operator", newOperator)
        .set("operatorOptions", newOperatorOptions)
        .set("value", newValue)
        .set("valueSrc", newValueSrc)
        .set("valueType", newValueType);
      if (!canReuseValue) {
        current = current.delete("asyncListValues");
      }
      return current;
    }));
  }

  return {state};
};

/**
 * @param {Immutable.Map} state
 * @param {Immutable.List} path
 * @param {string} operator
 */
const setOperator = (state, path, newOperator, config) => {
  const currentRule = state.getIn(expandTreePath(path));
  if (!currentRule) {
    // incorrect path
    return state;
  }
  const {showErrorMessage} = config.settings;
  const properties = currentRule.get("properties");
  const children = currentRule.get("children1");
  const currentField = properties.get("field");
  const currentFieldSrc = properties.get("fieldSrc");
  const fieldConfig = getFieldConfig(config, currentField);
  const isRuleGroup = fieldConfig?.type == "!group";
  const operatorConfig = getOperatorConfig(config, newOperator, currentField);
  const operatorCardinality = operatorConfig ? getOpCardinality(operatorConfig) : null;
  const canFix = true;

  state = state.updateIn(expandTreePath(path, "properties"), (map) => map.withMutations((current) => {
    const currentField = current.get("field");
    const currentOperatorOptions = current.get("operatorOptions");
    const _currentValue = current.get("value", new Immutable.List());
    const _currentValueSrc = current.get("valueSrc", new Immutable.List());
    const _currentOperator = current.get("operator");

    const {canReuseValue, newValue, newValueSrc, newValueType, newValueError} = getNewValueForFieldOp(
      { validateValue, validateRange },
      config, config, current, currentField, newOperator, "operator", canFix
    );
    if (showErrorMessage) {
      current = current
        .set("valueError", newValueError);
    }
    const newOperatorOptions = canReuseValue ? currentOperatorOptions : defaultOperatorOptions(config, newOperator, currentField);

    if (!canReuseValue) {
      current = current
        .delete("asyncListValues");
    }

    return current
      .set("operator", newOperator)
      .set("operatorOptions", newOperatorOptions)
      .set("value", newValue)
      .set("valueSrc", newValueSrc)
      .set("valueType", newValueType);
  }));

  if (isRuleGroup) {
    if (operatorCardinality == 0 && children.size == 0) {
      state = addItem(state, path, "rule", uuid(), defaultRuleProperties(config, currentField), config);
    }
  }

  return state;
};

/**
 * @param {Immutable.Map} state
 * @param {Immutable.List} path
 * @param {integer} delta
 * @param {*} value
 * @param {string} valueType
 * @param {*} asyncListValues
 */
const setValue = (state, path, delta, value, valueType, config, asyncListValues, _meta = {}) => {
  const currentRule = state.getIn(expandTreePath(path));
  if (!currentRule) {
    // incorrect path
    return {state};
  }
  const { canDropArgs, isEndValue } = _meta;
  const {fieldSeparator, showErrorMessage} = config.settings;
  const valueSrc = state.getIn(expandTreePath(path, "properties", "valueSrc", delta + "")) || null;
  if (valueSrc === "field" && Array.isArray(value))
    value = value.join(fieldSeparator);

  const field = state.getIn(expandTreePath(path, "properties", "field")) || null;
  //const fieldSrc = state.getIn(expandTreePath(path, "properties", "fieldSrc")) || null;
  const operator = state.getIn(expandTreePath(path, "properties", "operator")) || null;
  const operatorConfig = getOperatorConfig(config, operator, field);
  const operatorCardinality = operator ? getOpCardinality(operatorConfig) : null;

  const calculatedValueType = valueType || calculateValueType(value, valueSrc, config);
  const canFix = !showErrorMessage;
  const [fixedValue, allErrors] = validateValue(
    config, field, field, operator, value, calculatedValueType, valueSrc, asyncListValues, canFix, isEndValue, canDropArgs
  );
  const firstError = allErrors?.find(e => !e.fixed && !e.ignore);
  const validationError = firstError ? translateValidation(firstError) : null;
  // tip: even if canFix == false, use fixedValue, it can SAFELY fix value of select
  //  (get exact value from listValues, not string)
  let willFix = fixedValue !== value;
  if (willFix) {
    value = fixedValue;
  }

  // init lists
  state = initEmptyValueLists(state, path, config, operatorCardinality);

  // Additional validation for range values
  const values = Array.from({length: operatorCardinality}, (_, i) =>
    (i == delta ? value : state.getIn(expandTreePath(path, "properties", "value", i + "")) || null));
  const valueSrcs = Array.from({length: operatorCardinality}, (_, i) =>
    (state.getIn(expandTreePath(path, "properties", "valueSrc", i + "")) || null));
  const rangeErrorObj = validateRange(config, field, operator, values, valueSrcs);
  const rangeValidationError = rangeErrorObj ? translateValidation(rangeErrorObj) : null;

  const isValid = !validationError && !rangeValidationError;
  const canUpdValue = showErrorMessage ? true : isValid || willFix; // set only good value
  // const lastValue = state.getIn(expandTreePath(path, "properties", "value", delta));
  // const lastError = state.getIn(expandTreePath(path, "properties", "valueError", delta));
  // const lastRangeError = state.getIn(expandTreePath(path, "properties", "valueError", operatorCardinality));
  // const didDeltaErrorChanged = showErrorMessage ? lastError != validationError : !!lastError != !!validationError;
  // const didRangeErrorChanged = showErrorMessage ? lastRangeError != rangeValidationError : !!lastRangeError != !!rangeValidationError;
  // const didErrorChanged = didDeltaErrorChanged || didRangeErrorChanged;
  // const didEmptinessChanged = !!lastValue != !!value;
  // isInternalValueChange = !didEmptinessChanged && !didErrorChanged && !willFix;

  if (canUpdValue) {
    state = state.deleteIn(expandTreePath(path, "properties", "asyncListValues"));
    if (typeof value === "undefined") {
      state = state.setIn(expandTreePath(path, "properties", "value", delta), undefined);
      state = state.setIn(expandTreePath(path, "properties", "valueType", delta), null);
    } else {
      if (asyncListValues) {
        state = state.setIn(expandTreePath(path, "properties", "asyncListValues"), asyncListValues);
      }
      state = state.setIn(expandTreePath(path, "properties", "value", delta), value);
      state = state.setIn(expandTreePath(path, "properties", "valueType", delta), calculatedValueType);
    }
  }
  if (showErrorMessage) {
    // check list
    const lastValueErrorArr = state.getIn(expandTreePath(path, "properties", "valueError"));
    if (!lastValueErrorArr) {
      state = state
        .setIn(expandTreePath(path, "properties", "valueError"), new Immutable.List(new Array(operatorCardinality)));
    }
    // set error at delta
    state = state.setIn(expandTreePath(path, "properties", "valueError", delta), validationError);
    // set range error
    if (operatorCardinality >= 2) {
      state = state.setIn(expandTreePath(path, "properties", "valueError", operatorCardinality), rangeValidationError);
    }
  }

  return {state};
};

/**
 * @param {Immutable.Map} state
 * @param {Immutable.List} path
 * @param {integer} delta
 * @param {*} srcKey
 */
const setValueSrc = (state, path, delta, srcKey, config, _meta = {}) => {
  const currentRule = state.getIn(expandTreePath(path));
  if (!currentRule) {
    // incorrect path
    return state;
  }

  const {showErrorMessage} = config.settings;
  const field = state.getIn(expandTreePath(path, "properties", "field")) || null;
  //const fieldSrc = state.getIn(expandTreePath(path, "properties", "fieldSrc")) || null;
  const operator = state.getIn(expandTreePath(path, "properties", "operator")) || null;
  const operatorConfig = getOperatorConfig(config, operator, field);
  const operatorCardinality = operator ? getOpCardinality(operatorConfig) : null;

  // init lists
  state = initEmptyValueLists(state, path, config, operatorCardinality);

  state = state.setIn(expandTreePath(path, "properties", "value", delta + ""), undefined);
  state = state.setIn(expandTreePath(path, "properties", "valueType", delta + ""), null);
  state = state.deleteIn(expandTreePath(path, "properties", "asyncListValues"));

  if (showErrorMessage) {
    // clear value error
    state = state.setIn(expandTreePath(path, "properties", "valueError", delta), null);

    // if current operator is range, clear possible range error
    if (operatorConfig?.validateValues) {
      state = state.setIn(expandTreePath(path, "properties", "valueError", operatorCardinality), null);
    }
  }
  
  // set valueSrc
  if (typeof srcKey === "undefined") {
    state = state.setIn(expandTreePath(path, "properties", "valueSrc", delta + ""), null);
  } else {
    state = state.setIn(expandTreePath(path, "properties", "valueSrc", delta + ""), srcKey);
  }

  // maybe set default value
  if (srcKey) {
    const properties = state.getIn(expandTreePath(path, "properties"));
    // this call should return canReuseValue = false and provide default value
    const canFix = true;
    const {canReuseValue, newValue, newValueSrc, newValueType, newValueError} = getNewValueForFieldOp(
      { validateValue, validateRange },
      config, config, properties, field, operator, "valueSrc", canFix
    );
    if (!canReuseValue && newValueSrc.get(delta) == srcKey) {
      state = state.setIn(expandTreePath(path, "properties", "value", delta + ""), newValue.get(delta));
      state = state.setIn(expandTreePath(path, "properties", "valueType", delta + ""), newValueType.get(delta));
    }
  }

  return state;
};

/**
 * @param {Immutable.Map} state
 * @param {Immutable.List} path
 * @param {string} name
 * @param {*} value
 */
const setOperatorOption = (state, path, name, value) => {
  const currentRule = state.getIn(expandTreePath(path));
  if (!currentRule) {
    // incorrect path
    return state;
  }
  return state.setIn(expandTreePath(path, "properties", "operatorOptions", name), value);
};

/**
 * @param {Immutable.Map} state
 */
const checkEmptyGroups = (state, config) => {
  const {canLeaveEmptyGroup} = config.settings;
  if (!canLeaveEmptyGroup) {
    state = fixEmptyGroupsInTree(state);
  }
  return state;
};

const initEmptyValueLists = (state, path, config, operatorCardinality) => {
  if (!operatorCardinality) {
    const field = state.getIn(expandTreePath(path, "properties", "field")) || null;
    const operator = state.getIn(expandTreePath(path, "properties", "operator")) || null;
    const operatorConfig = getOperatorConfig(config, operator, field);
    operatorCardinality = operator ? getOpCardinality(operatorConfig) : null;
  }

  for (const k of ["value", "valueType", "valueError", "valueSrc"]) {
    if (!state.getIn(expandTreePath(path, "properties", k))) {
      state = state
        .setIn(expandTreePath(path, "properties", k), new Immutable.List(
          operatorCardinality ? Array.from({length: operatorCardinality}) : []
        ));
    }
  }

  return state;
};

// convert children deeply from JS to Immutable
const _addChildren1 = (config, item, children) => {
  if (children && Array.isArray(children)) {
    item.children1 = new Immutable.OrderedMap(
      children.reduce((map, it) => {
        const id1 = it.id ?? uuid();
        const it1 = {
          ...it,
          properties: defaultItemProperties(config, it).merge(fromJS(it.properties) || {}),
          id: id1
        };
        _addChildren1(config, it1, it1.children1);
        //todo: guarantee order
        return {
          ...map,
          [id1]: new Immutable.Map(it1)
        };
      }, {})
    );
  }
};

const getField = (state, path) => {
  const field = state.getIn(expandTreePath(path, "properties", "field")) || null;
  return field;
};

const emptyDrag = {
  dragging: {
    id: null,
    x: null,
    y: null,
    w: null,
    h: null
  },
  mousePos: {},
  dragStart: {
    id: null,
  },
};

const getActionMeta = (action, state) => {
  if (!action || !action.type)
    return null;
  const actionKeysToOmit = [
    "config", "asyncListValues"
  ];
  const actionTypesToIgnore = [
    constants.SET_TREE,
    constants.SET_DRAG_START,
    constants.SET_DRAG_PROGRESS,
    constants.SET_DRAG_END,
  ];
  let meta = mapValues(omit(action, actionKeysToOmit), applyToJS);
  let affectedField = action.path && getField(state.tree, action.path) || action.field;
  if (affectedField) {
    if (affectedField?.toJS)
      affectedField = affectedField.toJS();
    meta.affectedField = affectedField;
  }
  if (actionTypesToIgnore.includes(action.type) || action.type.indexOf("@@redux") == 0)
    meta = null;
  return meta;
};

/**
 * @param {Immutable.Map} state
 * @param {object} action
 */
export default (initialConfig, tree, getMemoizedTree, setLastTree, getLastConfig) => {
  const initTree = tree;
  const emptyState = {
    tree: initTree, 
    ...emptyDrag
  };
    
  return (state = emptyState, action) => {
    const config = getLastConfig?.() ?? action?.config ?? initialConfig;
    const unset = {__lastAction: undefined};
    let set = {};
    let actionMeta = getActionMeta(action, state);

    switch (action?.type) {
    case constants.SET_TREE: {
      const validatedTree = getMemoizedTree(config, action.tree);
      set.tree = validatedTree;
      break;
    }

    case constants.ADD_CASE_GROUP: {
      set.tree = addNewGroup(state.tree, action.path, "case_group", action.id, action.properties, config,  action.children, action.meta);
      break;
    }

    case constants.ADD_GROUP: {
      set.tree = addNewGroup(state.tree, action.path, "group", action.id, action.properties, config,  action.children, action.meta);
      break;
    }

    case constants.REMOVE_GROUP: {
      set.tree = removeGroup(state.tree, action.path, config);
      break;
    }

    case constants.ADD_RULE: {
      set.tree = addItem(state.tree, action.path, action.ruleType, action.id, action.properties, config, action.children);
      break;
    }

    case constants.REMOVE_RULE: {
      set.tree = removeRule(state.tree, action.path, config);
      break;
    }

    case constants.SET_CONJUNCTION: {
      set.tree = setConjunction(state.tree, action.path, action.conjunction);
      break;
    }

    case constants.SET_NOT: {
      set.tree = setNot(state.tree, action.path, action.not);
      break;
    }

    case constants.SET_FIELD: {
      const {state: newTree} = setField(
        state.tree, action.path, action.field, config,
        action.asyncListValues, action._meta
      );
      set.tree = newTree;
      break;
    }

    case constants.SET_FIELD_SRC: {
      set.tree = setFieldSrc(state.tree, action.path, action.srcKey, config);
      break;
    }

    case constants.SET_LOCK: {
      set.tree = setLock(state.tree, action.path, action.lock);
      break;
    }

    case constants.SET_OPERATOR: {
      set.tree = setOperator(state.tree, action.path, action.operator, config);
      break;
    }

    case constants.SET_VALUE: {
      const {state: newTree} = setValue(
        state.tree, action.path, action.delta, action.value, action.valueType,  config,
        action.asyncListValues, action._meta
      );
      set.tree = newTree;
      break;
    }

    case constants.SET_FUNC_VALUE: {
      const {state: newTree} = setFuncValue(
        config, state.tree, action.path, action.delta, action.parentFuncs, 
        action.argKey, action.value, action.valueType,
        action.asyncListValues, action._meta
      );
      set.tree = newTree;
      break;
    }

    case constants.SET_VALUE_SRC: {
      set.tree = setValueSrc(state.tree, action.path, action.delta, action.srcKey, config, action._meta);
      break;
    }

    case constants.SET_OPERATOR_OPTION: {
      set.tree = setOperatorOption(state.tree, action.path, action.name, action.value);
      break;
    }

    case constants.MOVE_ITEM: {
      set.tree = moveItem(state.tree, action.fromPath, action.toPath, action.placement, config);
      break;
    }

    case constants.SET_DRAG_START: {
      set.dragStart = action.dragStart;
      set.dragging = action.dragging;
      set.mousePos = action.mousePos;
      break;
    }

    case constants.SET_DRAG_PROGRESS: {
      set.mousePos = action.mousePos;
      set.dragging = action.dragging;
      break;
    }

    case constants.SET_DRAG_END: {
      set.tree = checkEmptyGroups(state.tree, config);
      set = { ...set, ...emptyDrag };
      break;
    }

    default: {
      break;
    }
    }

    if (actionMeta) {
      set.__lastAction = actionMeta;
    }

    if (setLastTree && set.tree && state.tree) {
      setLastTree(state.tree);
    }
    
    return {...state, ...unset, ...set};
  };

};
