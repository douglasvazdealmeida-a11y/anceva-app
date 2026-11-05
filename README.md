# Anceva Serviços

App de celular para lançar serviços de retroescavadeira e caminhão por cliente e fazer o recibo em PDF no modelo da Anceva. Os dados ficam numa planilha do Google.

## 1. Preparar a planilha (uma vez, no computador)

1. Crie uma planilha nova no Google Planilhas, por exemplo "Anceva - Serviços".
2. Menu **Extensões > Apps Script**. Apague o que estiver lá e cole o conteúdo de [`planilha/Codigo.gs`](planilha/Codigo.gs). Clique no disquete para salvar.
3. No alto, ao lado de "Executar", escolha a função **configurar** e clique em **Executar**. O Google pede autorização: escolha sua conta, clique em "Avançado" e em "Acessar (não seguro)". Isso aparece porque o script é seu, e não da Google.
4. Abaixo vai aparecer o **CÓDIGO DE ACESSO DO APP**. Anote.
5. Clique em **Implantar > Nova implantação**. Na engrenagem, escolha **App da Web**.
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
   - Clique em **Implantar** e copie o **URL do app da Web**, que termina em `/exec`.

## 2. Instalar no celular do seu pai (Android)

1. Monte o link de conexão juntando o endereço do app, `#conectar=`, o URL `/exec`, uma barra vertical `|` e o código:

   `https://douglasvazdealmeida-a11y.github.io/anceva-app/#conectar=https://script.google.com/macros/s/.../exec|CODIGO`

2. Mande esse link para o celular dele (WhatsApp para você mesmo, por exemplo) e abra no **Chrome**.
3. No Chrome, toque nos três pontinhos e depois em **Instalar app** (ou **Adicionar à tela inicial**).
4. Pronto: o ícone amarelo "Anceva" fica na tela inicial.

Se preferir, dá para abrir o app sem o link e preencher o endereço e o código na tela "Conectar à planilha".

## Como funciona

- Tudo que ele lança fica guardado no celular primeiro e vai para a planilha assim que tiver internet. A tela inicial mostra "Tudo salvo na planilha" quando está tudo enviado.
- **Enviar PDF do recibo** abre o menu de compartilhar do Android. Ali é só escolher o WhatsApp e o cliente.
- Você pode olhar e corrigir os dados direto na planilha. Só não mude os nomes das colunas nem a coluna `id`.

## Atualizar o código da planilha

Se o arquivo `Codigo.gs` mudar: cole a versão nova, salve, depois vá em **Implantar > Gerenciar implantações**, clique no lápis, escolha **Nova versão** e **Implantar**. O endereço continua o mesmo.
