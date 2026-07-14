// Physics Snippets Plugin
// Registers common physics LaTeX snippets

module.exports = function activate(api) {
  const snippets = [
    {
      name: "Maxwell's Equations",
      prefix: "maxwell",
      description: "Full set of Maxwell's equations in differential form",
      body: [
        "\\begin{align}",
        "  \\nabla \\cdot \\mathbf{E} &= \\frac{\\rho}{\\varepsilon_0} \\\\",
        "  \\nabla \\cdot \\mathbf{B} &= 0 \\\\",
        "  \\nabla \\times \\mathbf{E} &= -\\frac{\\partial \\mathbf{B}}{\\partial t} \\\\",
        "  \\nabla \\times \\mathbf{B} &= \\mu_0 \\mathbf{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}",
        "\\end{align}",
      ].join("\n"),
    },
    {
      name: "Schrödinger Equation",
      prefix: "schrodinger",
      description: "Time-dependent Schrödinger equation",
      body: [
        "\\begin{equation}",
        "  i\\hbar \\frac{\\partial}{\\partial t} \\Psi(\\mathbf{r}, t) =",
        "  \\left[-\\frac{\\hbar^2}{2m} \\nabla^2 + V(\\mathbf{r}, t)\\right]",
        "  \\Psi(\\mathbf{r}, t)",
        "\\end{equation}",
      ].join("\n"),
    },
    {
      name: "Navier-Stokes Equation",
      prefix: "navierstokes",
      description: "Incompressible Navier-Stokes equation",
      body: [
        "\\begin{equation}",
        "  \\rho \\left( \\frac{\\partial \\mathbf{u}}{\\partial t} +",
        "  \\mathbf{u} \\cdot \\nabla \\mathbf{u} \\right) =",
        "  -\\nabla p + \\mu \\nabla^2 \\mathbf{u} + \\mathbf{f}",
        "\\end{equation}",
      ].join("\n"),
    },
    {
      name: "Einstein Field Equations",
      prefix: "einstein",
      description: "Einstein's field equations of general relativity",
      body: [
        "\\begin{equation}",
        "  R_{\\mu\\nu} - \\frac{1}{2} R g_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} =",
        "  \\frac{8\\pi G}{c^4} T_{\\mu\\nu}",
        "\\end{equation}",
      ].join("\n"),
    },
  ];

  api.editor.registerSnippets("physics", snippets);
};
