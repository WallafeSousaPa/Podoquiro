using System.Text.Json;
using SourceAFIS;

internal static class Program
{
    static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    static async Task<int> Main()
    {
        var json = await Console.In.ReadToEndAsync();
        if (string.IsNullOrWhiteSpace(json))
        {
            Fail("Nenhuma imagem recebida para comparar.");
            return 1;
        }

        Entrada? entrada;
        try
        {
            entrada = JsonSerializer.Deserialize<Entrada>(json, JsonOpts);
        }
        catch (Exception ex)
        {
            Fail($"JSON inválido: {ex.Message}");
            return 1;
        }

        if (entrada?.Probe is null || entrada.Candidates is null || entrada.Candidates.Count == 0)
        {
            Fail("Informe a digital lida e ao menos um cadastro.");
            return 1;
        }

        try
        {
            var options = new FingerprintImageOptions { Dpi = 500 };
            var probe = new FingerprintTemplate(
                new FingerprintImage(
                    entrada.Probe.Width,
                    entrada.Probe.Height,
                    PixelsAfis(entrada.Probe),
                    options));
            var matcher = new FingerprintMatcher(probe);
            var scores = new List<SaidaScore>(entrada.Candidates.Count);
            foreach (var c in entrada.Candidates)
            {
                var cand = new FingerprintTemplate(
                    new FingerprintImage(c.Width, c.Height, PixelsAfis(c), options));
                var score = matcher.Match(cand);
                scores.Add(new SaidaScore { Id = c.Id, Score = Math.Round(score, 1) });
            }

            Console.WriteLine(JsonSerializer.Serialize(new Saida { Ok = true, Scores = scores }, JsonOpts));
            return 0;
        }
        catch (Exception ex)
        {
            Fail(ex.Message);
            return 1;
        }
    }

    static byte[] PixelsAfis(Imagem img)
    {
        var raw = Convert.FromBase64String(img.PixelsBase64);
        var n = img.Width * img.Height;
        if (raw.Length < n)
            throw new InvalidOperationException("Imagem da digital incompleta.");
        long soma = 0;
        for (var i = 0; i < n; i++) soma += raw[i];
        var media = soma / (double)n;
        var saida = new byte[n];
        if (media < 140)
        {
            for (var i = 0; i < n; i++) saida[i] = (byte)(255 - raw[i]);
        }
        else
        {
            Buffer.BlockCopy(raw, 0, saida, 0, n);
        }
        return saida;
    }

    static void Fail(string erro)
    {
        Console.WriteLine(JsonSerializer.Serialize(new Saida { Ok = false, Error = erro }, JsonOpts));
    }
}

sealed class Entrada
{
    public Imagem? Probe { get; set; }
    public List<Candidato>? Candidates { get; set; }
}

class Imagem
{
    public int Width { get; set; }
    public int Height { get; set; }
    public string PixelsBase64 { get; set; } = "";
}

class Candidato : Imagem
{
    public string Id { get; set; } = "";
}

sealed class Saida
{
    public bool Ok { get; set; }
    public string? Error { get; set; }
    public List<SaidaScore>? Scores { get; set; }
}

sealed class SaidaScore
{
    public string Id { get; set; } = "";
    public double Score { get; set; }
}
