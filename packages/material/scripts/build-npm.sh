rm -rf ./lib # old name
rm -rf ./cjs
rm -rf ./esm

babel -d ./cjs ./modules
ESM=1 babel -d ./esm ./modules
cp ./modules/index.d.ts ./cjs/index.d.ts
cp ./modules/index.d.ts ./esm/index.d.ts

rm -rf ./css
sass -I node_modules -I ../../node_modules styles/:css/ --no-source-map --style=expanded
cp ./styles/* ./css
