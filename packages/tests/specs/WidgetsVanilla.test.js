import * as configs from "../support/configs";
import * as inits from "../support/inits";
import { with_qb, with_qb_skins } from "../support/utils";


describe("vanilla widgets interactions", () => {
  it("change number value", async () => {
    await with_qb_skins(configs.with_all_types, inits.with_number, "JsonLogic", (qb, {expect_jlogic}) => {
      qb
        .find(".rule .rule--value .widget--widget input")
        .simulate("change", { target: { value: "3" } });
      expect_jlogic([null,
        { "and": [{ "==": [ { "var": "num" }, 3 ] }] }
      ]);
    });
  });

  it("@price change price value", async () => {
    await with_qb_skins(configs.with_all_types, inits.with_price, "JsonLogic", async (qb, { expect_jlogic }) => {
      const inputWrapper = qb.find(".rule .rule--value .widget--widget input");
      const inputNode = inputWrapper.at(0).getDOMNode();
      inputNode.value = "23.4298";
      inputWrapper.simulate("change", { target: inputNode });
      expect_jlogic([null,
        { "and": [{ ">": [ { "var": "price" }, 23.429 ] }] }
      ]);
    });
  });

  it("change text value", async () => {
    await with_qb_skins(configs.with_all_types, inits.with_text, "JsonLogic", (qb, {expect_jlogic}) => {
      qb
        .find(".rule .rule--value .widget--widget input")
        .simulate("change", { target: { value: "def" } });
      expect_jlogic([null,
        { "and": [{ "==": [ { "var": "str" }, "def" ] }] }
      ]);
    });
  });

  it("change date value", async () => {
    await with_qb(configs.with_all_types, inits.with_date, "JsonLogic", (qb, {expect_jlogic}) => {
      qb
        .find(".rule .rule--value .widget--widget input")
        .simulate("change", { target: { value: "2020-05-05" } });
      expect_jlogic([null,
        { "and": [{ "date==": [ { "var": "date" }, "2020-05-05T00:00:00.000Z" ] }] }
      ]);
    });
  });

  it("change datetime value", async () => {
    await with_qb(configs.with_all_types, inits.with_datetime, "JsonLogic", (qb, {expect_jlogic}) => {
      qb
        .find(".rule .rule--value .widget--widget input")
        .simulate("change", { target: { value: "2020-05-05T02:30" } });
      expect_jlogic([null,
        { "and": [{ "datetime==": [ { "var": "datetime" }, "2020-05-05T02:30:00.000Z" ] }] }
      ]);
    });
  });

  it("change select value", async () => {
    await with_qb(configs.with_all_types, inits.with_select, "JsonLogic", (qb, {expect_jlogic}) => {
      qb
        .find(".rule .rule--value .widget--widget select")
        .simulate("change", { target: { value: "green" } });
      expect_jlogic([null, {
        "and": [{  "==": [ { "var": "color" }, "green" ]  }]
      }]);
    });
  });

  it("change multiselect value", async () => {
    await with_qb(configs.with_all_types, inits.with_multiselect, "JsonLogic", (qb, {expect_jlogic}) => {
      qb
        .find(".rule .rule--value .widget--widget select")
        .simulate("change", { target: { options: [ {value: "yellow", selected: true}, {value: "green"}, {value: "orange"} ] } });
      expect_jlogic([null, {
        "and": [
          {
            "all": [
              { "var": "multicolor" },
              { "in": [ { "var": "" }, [ "yellow" ] ] }
            ]
          }
        ]
      }]);
    });
  });

  it("change bool value", async () => {
    await with_qb(configs.with_all_types, inits.with_bool, "JsonLogic", (qb, {expect_jlogic}) => {
      qb
        .find(".rule .rule--value .widget--widget input[value=false]")
        .simulate("change", { target: { value: "false" } });
      expect_jlogic([null, {
        "and": [{  "==": [ { "var": "stock" }, false ]  }]
      }]);
    });
  });

  it("change slider value", async () => {
    await with_qb(configs.with_all_types, inits.with_slider, "JsonLogic", (qb, {expect_jlogic}) => {
      qb
        .find(".rule .rule--value .widget--widget input[type='range']")
        .simulate("change", { target: { value: 42 } });
      expect_jlogic([null, {
        "and": [{  "==": [ { "var": "slider" }, 42 ]  }]
      }]);
    });
  });

  it("change time value", async () => {
    await with_qb(configs.with_all_types, inits.with_time, "JsonLogic", (qb, {expect_jlogic}) => {
      qb
        .find(".rule .rule--value .widget--widget input[type='time']")
        .simulate("change", { target: { value: "10:30" } });
      expect_jlogic([null, {
        "and": [{  "==": [ { "var": "time" }, 60*60*10+60*30 ]  }]
      }]);
    });
  });

});
