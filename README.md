# Point Cloud Web Tools

Testing and benchmarking different processing techniques for point cloud data.

![Point Cloud Web Tools Preview](images/pointcloud-webtools-preview.png)

[Watch Demo Video](https://youtu.be/FixpiAs2Gso)

This project is for experimenting with different tools to manipulate point cloud data, and benchmarking the efficiency and performance of tools using different code languages to process them.

WASM allows C++ to be compiled for web applications on the client side for near-native performance.

C++ processing can be done on the backend as well.

Though it's best to avoid excessive compute on the client's device and rather leave it to be a burden on the backend for a greater user experience.

WASM may still play a part for immediate and smaller processes such as tools. FIGMA currently uses WASM for its tooling and there may be uses for it in other cases.

## Running Instructions

To run the project:
```bash
yarn dev
```

To build the WASM:
```bash
cd frontend
yarn build-wasm
```