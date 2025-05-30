import React from "react";

// value widgets
import DateWidget from "./value/Date";
import DateTimeWidget from "./value/DateTime";
import TimeWidget from "./value/Time";
import SelectWidget from "./value/Select";
import TextWidget from "./value/Text";
import TextAreaWidget from "./value/TextArea";
import NumberWidget from "./value/Number";
import PriceWidget from "./value/Price";
import SliderWidget from "./value/Slider";
import RangeWidget from "./value/Range";
import BooleanWidget from "./value/Boolean";
import MultiSelectWidget from "./value/MultiSelect";
import AutocompleteWidget from "./value/Autocomplete";
import TreeSelectWidget from "./value/TreeSelect";

// field select widgets
import FieldSelect from "./core/FieldSelect";
import FieldDropdown from "./core/FieldDropdown";
import FieldCascader from "./core/FieldCascader";
import FieldTreeSelect from "./core/FieldTreeSelect";

// core components
import Icon from "./core/Icon";
import Button from "./core/Button";
import ButtonGroup from "./core/ButtonGroup";
import Conjs from "./core/Conjs";
import Switch from "./core/Switch";
import ValueSources from "./core/ValueSources";
import confirm from "./core/confirm";

import { ConfigProvider } from "antd";
const Provider = ({ config, children }) => <ConfigProvider locale={config.settings.locale.antd}>{children}</ConfigProvider>;

export default {
  DateWidget,
  DateTimeWidget,
  TimeWidget,
  SelectWidget,
  TextWidget,
  TextAreaWidget,
  NumberWidget,
  PriceWidget,
  SliderWidget,
  RangeWidget,
  BooleanWidget,
  MultiSelectWidget,
  AutocompleteWidget,
  TreeSelectWidget,

  FieldSelect,
  FieldDropdown,
  FieldCascader,
  FieldTreeSelect,

  Icon,
  Button,
  ButtonGroup,
  Conjs,
  Switch,
  ValueSources,
  confirm,

  Provider,
};