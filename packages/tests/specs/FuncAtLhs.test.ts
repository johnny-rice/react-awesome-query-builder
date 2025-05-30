import * as configs from "../support/configs";
import * as inits from "../support/inits";
import {
  export_checks, with_qb,
  getFuncsOptions, getFieldsOptions, selectFieldSrc, selectField,
  selectFieldFunc, setFieldFuncArgValue, setRhsValue,
} from "../support/utils";
import chai from "chai";
const { expect } = chai;
const {
  with_all_types,
  with_fieldSources,
  with_funcs,
  with_keepInputOnChangeFieldSrc,
} = configs;
// warning: don't put `export_checks` inside `it`

describe("LHS func", () => {
  describe("load from SQL", () => {
    describe("LOWER(..) LIKE ..", () => {
      export_checks([with_fieldSources, with_all_types, with_funcs], inits.sql_with_lhs_toLowerCase, "SQL", {
        "query": "LOWER(str) Starts with \"aaa\"",
        "sql": "LOWER(str) LIKE 'aaa%'",
      });
    });
  });

  describe("load from SpEL", () => {
    describe(".toLowerCase().startsWith()", () => {
      export_checks([with_fieldSources, with_all_types, with_funcs], inits.spel_with_lhs_toLowerCase, "SpEL", {
        "query": "LOWER(str) Starts with \"aaa\"",
        "queryHuman": "Lowercase(String: String) Starts with aaa",
        "sql": "LOWER(str) LIKE 'aaa%'",
        "spel": "str.toLowerCase().startsWith('aaa')",
        // todo: Operator starts_with is not supported
        "mongo": {
          "$expr": {
            "$regexFind": {
              "input": {
                "$toLower": "$str"
              },
              "regex": "^aaa"
            }
          }
        }
      });
    });

    describe(".toLowerCase().toUpperCase()", () => {
      export_checks([with_fieldSources, with_all_types, with_funcs], inits.spel_with_lhs_toLowerCase_toUpperCase, "SpEL", {
        "sql": "UPPER(LOWER(str)) = UPPER(str)",
        "spel": "str.toLowerCase().toUpperCase() == str.toUpperCase()",
        "mongo": {
          "$expr": {
            "$eq": [
              {
                "$toUpper": {
                  "$toLower": "$str"
                }
              },
              {
                "$toUpper": "$str"
              }
            ]
          }
        },
        "logic": {
          "and": [
            {
              "==": [
                {
                  "toUpperCase": [
                    {
                      "toLowerCase": [
                        { "var": "str" }
                      ]
                    }
                  ]
                },
                {
                  "toUpperCase": [
                    { "var": "str" }
                  ]
                }
              ]
            }
          ]
        }
      });
    });

    // describe("new Date()", () => {
    //   export_checks([with_fieldSources, with_all_types, with_funcs], inits.spel_with_new_Date, "SpEL");
    // });

    // describe("new SimpleDateFormat().parse()", () => {
    //   export_checks([with_fieldSources, with_all_types, with_funcs], inits.spel_with_SimpleDateFormat, "SpEL");
    // });

  });

  describe("defaultValue, isOptional", () => {
    describe("fills defaultValue when loading from SpeL", () => {
      export_checks([with_fieldSources, with_all_types, with_funcs], inits.spel_with_lhs_toLowerCase2, "SpEL", {
        "spel": "str.toLowerCase2(11) == 'aaa'",
        "query": "LOWER2(str, 11) == \"aaa\"",
        "queryHuman": "Lowercase2(String: String, def: 11) = aaa",
        "sql": "LOWER2(str, 11) = 'aaa'",
        "mongo": {
          "$expr": {
            "$eq": [
              {
                "$toLower2": [
                  "$str",
                  11
                ]
              },
              "aaa"
            ]
          }
        },
        "logic": {
          "and": [
            {
              "==": [
                {
                  "toLowerCase2": [
                    { "var": "str" },
                    11
                  ]
                },
                "aaa"
              ]
            }
          ]
        }
      });
    });

    describe("uses defaultValue on export", () => {
      export_checks([with_fieldSources, with_all_types, with_funcs], inits.tree_with_lhs_toLowerCase2, "default", {
        "spel": "str.toLowerCase2(11) == 'aaa'",
        "query": "LOWER2(str, 11) == \"aaa\"",
        "queryHuman": "Lowercase2(String: String, def: 11) = aaa",
        "sql": "LOWER2(str, 11) = 'aaa'",
        "mongo": {
          "$expr": {
            "$eq": [
              {
                "$toLower2": [
                  "$str",
                  11
                ]
              },
              "aaa"
            ]
          }
        },
        "logic": {
          "and": [
            {
              "==": [
                {
                  "toLowerCase2": [
                    { "var": "str" },
                    11
                  ]
                },
                "aaa"
              ]
            }
          ]
        }
      }, [
        // validation:
        "custom.LOWER2 = aaa  >>  * [lhs] Value of arg def for func Lowercase2 is required"
      ]);
    });
  });

  describe("interactions on vanilla", () => {
    it("change field source to func, and vice versa", async () => {
      await with_qb([
        with_fieldSources, with_all_types, with_funcs, with_keepInputOnChangeFieldSrc
      ], inits.with_text, "JsonLogic", (qb, {expect_jlogic}) => {
        // select src = func
        selectFieldSrc(qb, "func");
        expect_jlogic([null, undefined], 0);

        // check that text funcs are bold, other ones - not
        const [allOptions, boldOptions] = getFuncsOptions(qb);
        expect(boldOptions.length).to.be.lessThan(allOptions.length);
        expect(boldOptions).to.include.members(["LOWER", "UPPER"]);
        expect(boldOptions).to.not.include.members(["NOW", "RELATIVE_DATETIME", "LINEAR_REGRESSION"]);

        // select LOWER
        selectFieldFunc(qb, "LOWER");
        expect_jlogic([null, undefined], 1);

        // select arg for LOWER
        setFieldFuncArgValue(qb, 0, "ggg");
        // RHS should be preserved
        expect_jlogic([null,
          { "and": [{ "==": [ { "toLowerCase": [ "ggg" ] }, "abc" ] }] }
        ], 2);

        // select UPPER
        selectFieldFunc(qb, "UNKNOWN!"); // should not produce error
        selectFieldFunc(qb, "UPPER");
        // RHS should be preserved
        expect_jlogic([null,
          { "and": [{ "==": [ { "toUpperCase": [ "ggg" ] }, "abc" ] }] }
        ], 3);
        // bold marks should remain
        const [allOptions2, boldOptions2] = getFuncsOptions(qb);
        expect(boldOptions2.length).to.equal(3);
        expect(allOptions2.length).to.equal(allOptions2.length);

        // select NOW
        selectFieldFunc(qb, "NOW");
        expect_jlogic([null, undefined], 4);
        // there should not be bold marks
        const [allOptions3, boldOptions3] = getFuncsOptions(qb);
        expect(boldOptions3.length).to.equal(0);
        expect(allOptions3.length).to.equal(allOptions2.length);
        setRhsValue(qb, "2020-05-05");
        expect_jlogic([null,
          { "and": [{ "datetime==": [ { "now": [] }, "2020-05-05T00:00:00.000Z" ] }] }
        ], 5);
  
        // select src = field
        selectFieldSrc(qb, "field");
        expect_jlogic([null, undefined], 6);
        // check that datetime fields are bold, other ones - not
        const [allOptions4, boldOptions4] = getFieldsOptions(qb);
        expect(boldOptions4.length).to.be.lessThan(allOptions4.length);
        expect(boldOptions4).to.include.members(["datetime"]);

        // select datetime field
        selectField(qb, "datetime");
        // RHS should be preserved
        expect_jlogic([null,
          { "and": [{ "datetime==": [ { "var": "datetime" }, "2020-05-05T00:00:00.000Z" ] }] }
        ], 7);
      }, {
        ignoreLog: (errText) => {
          return errText.includes("No config for LHS Map { \"func\": \"UNKNOWN!\"");
        }
      });
    });
  });

});